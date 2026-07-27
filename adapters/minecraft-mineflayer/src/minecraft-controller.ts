import mineflayer, { type Bot } from 'mineflayer'
import minecraftData from 'minecraft-data'
import pathfinderModule from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { AdapterConfig } from './config.js'
import { isImmediateAction, type ActionArguments, type ActionCommand } from './protocol.js'
import { defensiveResponse, defensiveRetreatTarget, isHostileMob, reconnectDelay } from './safety.js'

const faceVectors = {
  up: new Vec3(0, 1, 0),
  down: new Vec3(0, -1, 0),
  north: new Vec3(0, 0, -1),
  south: new Vec3(0, 0, 1),
  east: new Vec3(1, 0, 0),
  west: new Vec3(-1, 0, 0),
} as const
const { goals, Movements, pathfinder } = pathfinderModule

function coordinates(args: ActionArguments) {
  if (args.targetX === undefined || args.targetY === undefined || args.targetZ === undefined) throw new Error('This action requires targetX, targetY and targetZ')
  return new Vec3(Math.floor(args.targetX), Math.floor(args.targetY), Math.floor(args.targetZ))
}

function requireName(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`)
  return value
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export class MinecraftController {
  bot: Bot
  private movements?: InstanceType<typeof Movements>
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private connected = false
  private stage = 'connecting'
  private lastAction = 'Waiting for Minecraft connection'
  private stageChangedAt = new Date().toISOString()
  private lastHealth = 20
  private defensiveResponseGeneration = 0
  private defensiveRetreatCooldownUntil = 0
  private defensiveCombatEntityId?: number
  private nextDefensiveAttackAt = 0
  private safetyReflexEnabled = true
  private connectionGeneration = 0
  private reconnectAttempt = 0
  private reconnectEnabled = true
  private reconnectTimer?: NodeJS.Timeout

  constructor(readonly config: AdapterConfig) {
    this.bot = this.connect()
  }

  private safeMovements(bot: Bot) {
    const movements = new Movements(bot)
    movements.canDig = true
    movements.allowParkour = false
    movements.allow1by1towers = false
    movements.allowSprinting = true
    movements.maxDropDown = 1
    movements.infiniteLiquidDropdownDistance = false
    movements.dontCreateFlow = true
    movements.dontMineUnderFallingBlock = true
    movements.entityCost = 8
    const weightedMovements = movements as InstanceType<typeof Movements> & { liquidCost: number }
    weightedMovements.liquidCost = 8
    for (const name of ['cactus', 'campfire', 'magma_block', 'powder_snow', 'soul_campfire', 'soul_fire', 'sweet_berry_bush']) {
      const block = bot.registry.blocksByName[name]
      if (block) movements.blocksToAvoid.add(block.id)
    }
    for (const name of ['creeper', 'skeleton', 'stray', 'witch', 'warden']) movements.entitiesToAvoid.add(name)
    return movements
  }

  private connect() {
    const connectionGeneration = ++this.connectionGeneration
    const reconnecting = this.reconnectAttempt > 0
    this.connected = false
    this.updateActivity('connecting', reconnecting
      ? `Minecraft reconnect attempt ${this.reconnectAttempt}`
      : 'Connecting to Minecraft')
    const bot = mineflayer.createBot({
      host: this.config.minecraftHost,
      port: this.config.minecraftPort,
      username: this.config.username,
      auth: this.config.auth,
      ...(this.config.version ? { version: this.config.version } : {}),
      respawn: true,
    })
    bot.loadPlugin(pathfinder)
    let spawnCount = 0
    bot.on('spawn', () => {
      if (connectionGeneration !== this.connectionGeneration) return
      spawnCount += 1
      this.movements = this.safeMovements(bot)
      bot.pathfinder.setMovements(this.movements)
      this.connected = true
      this.lastHealth = bot.health
      this.safetyReflexEnabled = true
      this.reconnectAttempt = 0
      this.updateActivity('observing', spawnCount > 1
        ? 'Minecraft bot respawned · mission recovery ready'
        : reconnecting
          ? 'Minecraft bot reconnected · fresh observation required'
          : 'Minecraft bot spawned')
    })
    bot.on('death', () => {
      if (connectionGeneration !== this.connectionGeneration) return
      this.connected = false
      this.generation += 1
      this.clearDefensiveCombat()
      this.updateActivity('blocked', 'Minecraft bot died · automatic respawn pending')
    })
    bot.on('health', () => {
      if (connectionGeneration !== this.connectionGeneration) return
      const lostHealth = bot.health < this.lastHealth
      this.lastHealth = bot.health
      if (lostHealth) this.beginDefensiveResponse()
    })
    bot.on('physicsTick', () => {
      if (connectionGeneration === this.connectionGeneration) this.tickDefensiveCombat()
    })
    bot.on('goal_reached', () => {
      if (connectionGeneration !== this.connectionGeneration) return
      if (this.stage === 'evading') {
        this.updateActivity('observing', 'Defensive retreat completed')
      }
    })
    bot.on('end', (reason) => {
      if (connectionGeneration !== this.connectionGeneration) return
      this.handleDisconnect(`Minecraft disconnected: ${reason}`)
    })
    bot.on('kicked', (reason) => {
      if (connectionGeneration !== this.connectionGeneration) return
      this.handleDisconnect(`Minecraft kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`.slice(0, 500))
    })
    bot.on('error', (error) => {
      if (connectionGeneration !== this.connectionGeneration) return
      this.updateActivity('blocked', `Minecraft error: ${error.message}`.slice(0, 500))
      if (!this.connected) this.scheduleReconnect()
    })
    return bot
  }

  status() {
    return { connected: this.connected, stage: this.stage, lastAction: this.lastAction, stageChangedAt: this.stageChangedAt }
  }

  enqueue(command: ActionCommand) {
    if (isImmediateAction(command.action)) {
      this.emergencyStop()
      return Promise.resolve()
    }
    const generation = this.generation
    const defensiveResponseGeneration = this.defensiveResponseGeneration
    this.safetyReflexEnabled = true
    this.updateActivity('acting', `${command.action} queued`)
    const action = this.queue.then(async () => {
        if (generation !== this.generation) throw new Error('Action cancelled by emergency stop')
        await this.execute(command, generation)
        if (generation === this.generation) {
          this.updateActivity('observing', `${command.action} completed`)
        }
      })
    const tracked = action.catch((error) => {
      if (this.defensiveResponseGeneration !== defensiveResponseGeneration) {
        this.updateActivity(this.defensiveCombatEntityId === undefined ? 'evading' : 'defending', `${command.action} interrupted by defensive safety response`)
        return
      }
      if (generation === this.generation) {
        this.updateActivity('blocked', `${command.action} failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500))
      }
      throw error
    })
    this.queue = tracked.catch(() => undefined)
    return tracked
  }

  emergencyStop() {
    this.generation += 1
    this.safetyReflexEnabled = false
    this.bot.pathfinder?.setGoal(null)
    this.bot.clearControlStates()
    this.bot.stopDigging()
    this.bot.deactivateItem()
    this.updateActivity('stopped', 'Emergency stop applied')
    return this.lastAction
  }

  shutdown() {
    this.reconnectEnabled = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.emergencyStop()
    this.bot.quit('GAME LAB bridge stopped')
  }

  private handleDisconnect(reason: string) {
    if (!this.connected && this.reconnectTimer) return
    this.connected = false
    this.generation += 1
    this.clearDefensiveCombat()
    this.updateActivity('disconnected', reason)
    this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (!this.reconnectEnabled || this.reconnectTimer) return
    const delay = reconnectDelay(++this.reconnectAttempt)
    this.updateActivity('connecting', `Minecraft reconnect scheduled in ${delay / 1_000}s · attempt ${this.reconnectAttempt}`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (!this.reconnectEnabled) return
      this.bot = this.connect()
    }, delay)
    this.reconnectTimer.unref()
  }

  private hostileEntities() {
    return Object.values(this.bot.entities)
      .filter((entity) => entity !== this.bot.entity
        && entity.type !== 'player'
        && entity.position
        && isHostileMob(entity.name ?? entity.displayName ?? entity.type))
      .sort((left, right) => left.position.distanceTo(this.bot.entity.position) - right.position.distanceTo(this.bot.entity.position))
  }

  private heldWeapon() {
    return this.bot.inventory.items()
      .filter((item) => /(?:_sword|_axe|trident)$/.test(item.name))
      .sort((left, right) => {
        const priority = (name: string) => name.endsWith('_sword') ? 0 : name === 'trident' ? 1 : 2
        return priority(left.name) - priority(right.name)
      })[0]
  }

  private beginDefensiveResponse() {
    if (!this.connected || !this.safetyReflexEnabled || Date.now() < this.defensiveRetreatCooldownUntil) return
    const hostiles = this.hostileEntities()
    const hostile = hostiles[0]
    if (!hostile) return
    const weapon = this.heldWeapon()
    const response = defensiveResponse({
      health: this.bot.health,
      hostileCount: hostiles.length,
      nearestDistance: hostile.position.distanceTo(this.bot.entity.position),
      nearestName: hostile.name ?? hostile.displayName ?? hostile.type,
      hasWeapon: Boolean(weapon),
    })
    this.defensiveResponseGeneration += 1
    this.defensiveRetreatCooldownUntil = Date.now() + 2_000
    this.bot.stopDigging()
    this.bot.deactivateItem()
    if (response === 'fight') {
      this.defensiveCombatEntityId = hostile.id
      this.nextDefensiveAttackAt = 0
      if (weapon) void this.bot.equip(weapon, 'hand').catch(() => undefined)
      this.bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2))
      this.updateActivity('defending', `Defensive combat against ${hostile.name ?? hostile.displayName ?? 'hostile mob'} · health ${this.bot.health}`)
      return
    }
    this.clearDefensiveCombat()
    const target = defensiveRetreatTarget(this.bot.entity.position, hostile.position)
    this.bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2))
    this.updateActivity('evading', `Defensive retreat from ${hostile.name ?? hostile.displayName ?? 'hostile mob'} · ${hostiles.length} hostile · health ${this.bot.health} · target ${target.x},${target.y},${target.z}`)
  }

  private clearDefensiveCombat() {
    this.defensiveCombatEntityId = undefined
    this.nextDefensiveAttackAt = 0
  }

  private tickDefensiveCombat() {
    if (!this.connected || this.defensiveCombatEntityId === undefined || this.stage !== 'defending') return
    const target = this.bot.entities[this.defensiveCombatEntityId]
    if (!target || !target.position || !isHostileMob(target.name ?? target.displayName ?? target.type)) {
      this.clearDefensiveCombat()
      this.bot.pathfinder.setGoal(null)
      this.updateActivity('observing', 'Defensive combat completed · threat cleared')
      return
    }
    if (this.bot.health < 10 || this.hostileEntities().length > 1) {
      this.defensiveRetreatCooldownUntil = 0
      this.beginDefensiveResponse()
      return
    }
    const distance = target.position.distanceTo(this.bot.entity.position)
    if (distance > 6) {
      this.clearDefensiveCombat()
      this.bot.pathfinder.setGoal(null)
      this.updateActivity('observing', 'Defensive combat completed · threat moved away')
      return
    }
    if (distance > 3.2) {
      this.bot.pathfinder.setGoal(new goals.GoalFollow(target, 2))
      return
    }
    this.bot.pathfinder.setGoal(null)
    if (Date.now() < this.nextDefensiveAttackAt) return
    this.nextDefensiveAttackAt = Date.now() + 650
    this.bot.attack(target)
  }

  private async pulseJump(durationMs = 450) {
    this.bot.setControlState('jump', true)
    this.bot.setControlState('forward', true)
    try {
      await new Promise((resolve) => setTimeout(resolve, Math.max(150, Math.min(1_200, durationMs))))
    } finally {
      this.bot.setControlState('jump', false)
      this.bot.setControlState('forward', false)
    }
  }

  private async gotoWithRecovery(target: Vec3, generation: number, radius = 1) {
    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (generation !== this.generation) throw new Error('Movement cancelled before path recovery')
      let timeout: NodeJS.Timeout | undefined
      try {
        await Promise.race([
          this.bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, radius)),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              this.bot.pathfinder.setGoal(null)
              reject(new Error(`Pathfinder attempt ${attempt} timed out after 12 seconds`))
            }, 12_000)
          }),
        ])
        return
      } catch (error) {
        lastError = error
        this.bot.pathfinder.setGoal(null)
        if (attempt === 2 || generation !== this.generation) break
        this.updateActivity('acting', `Path blocked · automatic jump recovery ${attempt}/1`)
        await this.pulseJump()
        this.movements = this.safeMovements(this.bot)
        this.bot.pathfinder.setMovements(this.movements)
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }
    throw new Error(`Movement blocked after automatic jump recovery: ${errorText(lastError)}`)
  }

  private updateActivity(stage: string, lastAction: string) {
    if (this.stage !== stage) this.stageChangedAt = new Date().toISOString()
    this.stage = stage
    this.lastAction = lastAction
  }

  private entity(entityId: string | undefined) {
    const numericId = Number(entityId?.replace(/^entity-/, ''))
    const entity = Number.isInteger(numericId) ? this.bot.entities[numericId] : undefined
    if (!entity) throw new Error('Target entity is unavailable or outside the current observation')
    return entity
  }

  private item(itemName: string | undefined) {
    const name = requireName(itemName, 'itemName')
    const item = this.bot.inventory.items().find((candidate) => candidate.name === name)
    if (!item) throw new Error(`Inventory does not contain ${name}`)
    return item
  }

  private block(args: ActionArguments) {
    if (args.targetX !== undefined || args.targetY !== undefined || args.targetZ !== undefined) {
      const block = this.bot.blockAt(coordinates(args))
      if (!block) throw new Error('Target block is not loaded')
      if (args.blockName && block.name !== args.blockName) throw new Error(`Checkpoint mismatch: expected ${args.blockName}, found ${block.name}`)
      return block
    }
    const blockName = requireName(args.blockName, 'blockName')
    const data = minecraftData(this.bot.version)
    const blockType = data.blocksByName[blockName]?.id
    if (blockType === undefined) throw new Error(`Unknown block ${blockName} for Minecraft ${this.bot.version}`)
    const found = this.bot.findBlock({ matching: blockType, maxDistance: args.maxDistance ?? 32 })
    if (!found) throw new Error(`No ${blockName} found within ${args.maxDistance ?? 32} blocks`)
    return found
  }

  private async execute(command: ActionCommand, generation: number) {
    if (!this.connected) throw new Error('Minecraft bot is not connected')
    const args = command.arguments
    if (command.action === 'stop') {
      this.emergencyStop()
      return
    }
    if (command.action === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, args.durationMs ?? 1_000))
      return
    }
    if (command.action === 'jump') {
      await this.pulseJump(args.durationMs ?? 450)
      return
    }
    if (command.action === 'move_to' || command.action === 'navigate_to') {
      const target = coordinates(args)
      await this.gotoWithRecovery(target, generation)
      return
    }
    if (command.action === 'mine_block') {
      const block = this.block(args)
      await this.gotoWithRecovery(block.position, generation, 3)
      if (generation !== this.generation) return
      await this.bot.dig(block)
      return
    }
    if (command.action === 'place_block') {
      const target = coordinates(args)
      const item = this.item(args.itemName ?? args.blockName)
      await this.bot.equip(item, 'hand')
      const face = args.face ?? 'up'
      const faceVector = faceVectors[face]
      const reference = this.bot.blockAt(target.minus(faceVector))
      if (!reference) throw new Error('Placement reference block is not loaded')
      await this.gotoWithRecovery(reference.position, generation, 3)
      if (generation !== this.generation) return
      await this.bot.placeBlock(reference, faceVector)
      return
    }
    if (command.action === 'craft_item') {
      const itemName = requireName(args.itemName, 'itemName')
      const data = minecraftData(this.bot.version)
      const itemType = data.itemsByName[itemName]?.id
      if (itemType === undefined) throw new Error(`Unknown item ${itemName} for Minecraft ${this.bot.version}`)
      const count = args.count ?? 1
      const craftingTable = this.bot.findBlock({ matching: data.blocksByName.crafting_table.id, maxDistance: 32 })
      const recipes = this.bot.recipesFor(itemType, null, count, craftingTable)
      const recipe = recipes[0]
      if (!recipe) throw new Error(`No available recipe for ${count} ${itemName}`)
      await this.bot.craft(recipe, count, craftingTable ?? undefined)
      return
    }
    if (command.action === 'equip_item') {
      await this.bot.equip(this.item(args.itemName), args.interaction === 'off-hand' ? 'off-hand' : 'hand')
      return
    }
    if (command.action === 'attack_entity') {
      const entity = this.entity(args.entityId)
      await this.bot.pathfinder.goto(new goals.GoalFollow(entity, 2))
      if (generation !== this.generation) return
      this.bot.attack(entity)
      return
    }
    if (command.action === 'interact') {
      await this.bot.activateEntity(this.entity(args.entityId))
      return
    }
    if (command.action === 'use_item') {
      if (args.itemName) await this.bot.equip(this.item(args.itemName), 'hand')
      this.bot.activateItem()
      return
    }
    throw new Error(`Unsupported Minecraft action: ${command.action}`)
  }
}
