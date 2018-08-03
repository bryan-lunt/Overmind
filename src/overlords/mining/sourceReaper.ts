// SourceReaperOverlord -- spawns offensive creeps to allow source keeper mining

import {Overlord} from '../Overlord';
import {CombatZerg} from '../../zerg/CombatZerg';
import {DirectiveSKOutpost} from '../../directives/core/outpostSK';
import {CreepSetup} from '../CreepSetup';
import {RoomIntel} from '../../intel/roomIntel';
import {minBy} from '../../utilities/utils';
import {Mem} from '../../Memory';
import {log} from '../../console/log';
import {CombatTargeting} from '../../targeting/CombatTargeting';
import {Movement} from '../../movement/Movement';

export const ReaperSetup = new CreepSetup('zergling', {
	pattern  : [MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, HEAL, MOVE],
	sizeLimit: Infinity,
});

export const DefenderSetup = new CreepSetup('hydralisk', {
	pattern  : [MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, HEAL, HEAL, MOVE],
	sizeLimit: Infinity,
});

interface SourceReaperOverlordMemory {
	targetLairID?: string;
}

export class SourceReaperOverlord extends Overlord {

	static requiredRCL = 7;

	memory: SourceReaperOverlordMemory;
	targetLair: StructureKeeperLair | undefined;

	reapers: CombatZerg[];
	defenders: CombatZerg[];

	constructor(directive: DirectiveSKOutpost, priority = 500 /* TODO */) {
		super(directive, 'sourceReaper', priority);
		this.memory = Mem.wrap(directive.memory, 'sourceReaper');
		this.targetLair = this.memory.targetLairID ? <StructureKeeperLair>deref(this.memory.targetLairID) : undefined;
		if (!this.targetLair || (this.targetLair.ticksToSpawn || Infinity) >= 299) {
			this.targetLair = this.getNextTargetLair();
		}
	}

	init() {
		let defenderAmount = this.room && (this.room.invaders.length > 0
										   || RoomIntel.isInvasionLikely(this.room)) ? 1 : 0;
		this.wishlist(1, ReaperSetup);
		this.wishlist(defenderAmount, DefenderSetup);
	}

	private getNextTargetLair(): StructureKeeperLair | undefined {
		if (!this.room) return;
		// If any lairs have an active keeper, target that
		let activeLair = _.find(this.room.keeperLairs,
								lair => lair.pos.findInRange(lair.room.sourceKeepers, 5).length > 0);
		if (activeLair) return activeLair;
		// Otherwise target whatever is closest to spawning
		return minBy(this.room.keeperLairs,
					 lair => lair.ticksToSpawn || Infinity); // not sure why ticksToSpawn is number | undefined
	}

	private handleReaper(reaper: CombatZerg) {

		// Go to keeper room
		if (!this.targetLair || !this.room || reaper.room != this.room || reaper.pos.isEdge) {
			reaper.healSelfIfPossible();
			reaper.goTo(this.pos);
			return;
		}

		if (this.room.invaders.length > 0) {
			// Handle invader actions
			if (reaper.hits >= reaper.hitsMax * .5) {
				let result = reaper.autoMelee(this.room.invaders);
				if (result == undefined) { // didn't attack
					reaper.autoHeal();
				}
			} else {
				reaper.healSelfIfPossible();
			}
			// Kite around ranged invaders until a defender arrives
			if (this.room.invaders.length > 2 && _.filter(this.defenders, def => def.room == this.room).length == 0) {
				reaper.kite(this.room.hostiles);
				reaper.healSelfIfPossible();
			}
			// If defender is already here or a small invasion
			else {
				let target = CombatTargeting.findTarget(reaper, this.room.invaders);
				if (target) {
					Movement.invasionMove(reaper, target);
				} else {
					log.warning(`KeeperReaper@${reaper.pos.print}: no invader target!`);
				}
			}
		} else {
			// Standard keeperReaper actions
			let isAttacking = false;
			let range;
			let nearestHostile = reaper.pos.findClosestByRange(this.room.hostiles) as Creep;
			if (nearestHostile && reaper.pos.isNearTo(nearestHostile)) {
				reaper.attack(nearestHostile);
				reaper.move(reaper.pos.getDirectionTo(nearestHostile));
			} else {
				let keeper = this.targetLair.pos.findClosestByLimitedRange(this.room.sourceKeepers, 7);
				if (keeper) { // attack the source keeper
					if (reaper.hits == reaper.hitsMax || reaper.pos.getRangeTo(keeper) == 4) {
						reaper.goTo(keeper); // stop and heal at range 4 if needed
					}
				} else { // travel to next lair
					reaper.goTo(this.targetLair, {range: 1});
				}
			}
			reaper.healSelfIfPossible();
		}

	}

	run() {

	}

}