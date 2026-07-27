import mineflayer, { type Bot } from 'mineflayer'
import minecraftData from 'minecraft-data'
import pathfinderModule from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import type { AdapterConfig } from './config.js'
import type { ActionArguments, ActionCommand } from './protocol.js'

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

export class MinecraftController {
  readonly bot: Bot
  private movements?: InstanceType<typeof Movements>
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private connected = false
  private stage = 'connecting'
  private lastAction = 'Waiting for Minecraft connection'

  constructor(readonly config: AdapterConfig) {
    this.bot = mineflayer.createBot({
      host: config.minecraftHost,
      port: config.minecraftPort,
      username: config.username,
      auth: config.auth,
      ...(config.version ? { version: config.version } : {}),
    })
    this.bot.loadPlugin(pathfinder)
    this.bot.once('spawn', () => {
      this.movements = new Movements(this.bot)
      this.movements.canDig = true
      this.bot.pathfinder.setMovements(this.movements)
      this.connected = true
      this.stage = 'observing'
      this.lastAction = 'Minecraft bot spawned'
    })
    this.bot.on('end', (reason) => {
      this.connected = false
      this.stage = 'disconnected'
      this.lastAction = `Minecraft disconnected: ${reason}`
    })
    this.bot.on('kicked', (reason) => {
      this.connected = false
      this.stage = 'blocked'
      this.lastAction = `Minecraft kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`.slice(0, 500)
    })
    this.bot.on('error', (error) => {
      this.stage = 'blocked'
      this.lastAction = `Minecraft error: ${error.message}`.slice(0, 500)
    })
  }

  status() {
    return { connected: this.connected, stage: this.stage, lastAction: this.lastAction }
  }

  enqueue(command: ActionCommand) {
    const generation = this.generation
    this.stage = 'acting'
    this.lastAction = `${command.action} queued`
    const action = this.queue.then(async () => {
        if (generation !== this.generation) throw new Error('Action cancelled by emergency stop')
        await this.execute(command, generation)
        if (generation === this.generation) {
          this.stage = 'observing'
          this.lastAction = `${command.action} completed`
        }
      })
    const tracked = action.catch((error) => {
      if (generation === this.generation) {
        this.stage = 'blocked'
        this.lastAction = `${command.action} failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500)
      }
      throw error
    })
    this.queue = tracked.catch(() => undefined)
    return tracked
  }

  emergencyStop() {
    this.generation += 1
    this.bot.pathfinder?.setGoal(null)
    this.bot.clearControlStates()
    this.bot.stopDigging()
    this.bot.deactivateItem()
    this.stage = 'stopped'
    this.lastAction = 'Emergency stop applied'
    return this.lastAction
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
    if (command.action === 'move_to' || command.action === 'navigate_to') {
      const target = coordinates(args)
      await this.bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1))
      return
    }
    if (command.action === 'mine_block') {
      const block = this.block(args)
      await this.bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3))
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
      await this.bot.pathfinder.goto(new goals.GoalNear(reference.position.x, reference.position.y, reference.position.z, 3))
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
