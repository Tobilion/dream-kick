/**
 * state.js — top-level finite state machine / screen router.
 * States: MENU, TEAM_SELECT, MATCH, RESULTS.
 * Each registered state gets { enter(data), exit(), update(dt) } hooks.
 */
export class StateMachine {
  constructor() {
    this.states = new Map();
    this.current = null;
    this.name = null;
  }

  /** Register a state. Hooks are optional. */
  register(name, hooks) {
    this.states.set(name, { enter() {}, exit() {}, update() {}, ...hooks });
  }

  /** Transition to a state, passing optional data to its enter(). */
  go(name, data) {
    if (this.current) this.current.exit();
    this.name = name;
    this.current = this.states.get(name);
    if (!this.current) throw new Error(`Unknown state: ${name}`);
    this.current.enter(data);
  }

  update(dt) {
    if (this.current) this.current.update(dt);
  }

  is(name) { return this.name === name; }
}
