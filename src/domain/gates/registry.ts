import type { GateId, Idea, Settings, Status } from "../types";
import { devilGate } from "./devil";
import { feynmanGate } from "./feynman";
import type { Gate } from "./gate";
import { socraticGate } from "./socratic";

/** Gerbang baru cukup didaftarkan di sini; StateMachine tidak perlu diubah. */
export class GateRegistry {
	private gates = new Map<GateId, Gate>();

	constructor(gates: Gate[] = []) {
		for (const g of gates) this.register(g);
	}

	register(gate: Gate): void {
		this.gates.set(gate.id, gate);
	}

	get(id: GateId): Gate | undefined {
		return this.gates.get(id);
	}

	/** Gerbang pertama yang berlaku untuk transisi ini dan belum dilewati. */
	findRequired(idea: Idea, from: Status, to: Status, settings: Settings): Gate | undefined {
		for (const g of this.gates.values()) {
			if (g.appliesTo(idea, from, to, settings) && !g.isPassed(idea)) return g;
		}
		return undefined;
	}
}

export const defaultRegistry = new GateRegistry([socraticGate, feynmanGate, devilGate]);
