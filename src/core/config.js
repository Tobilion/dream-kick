/**
 * config.js — every tunable constant in the game.
 * Units: meters, seconds, meters/second unless stated.
 */
export const CONFIG = {
  PITCH: {
    LENGTH: 105, WIDTH: 68,
    GOAL_WIDTH: 7.32, GOAL_HEIGHT: 2.44, GOAL_DEPTH: 2.2,
    BOX_LENGTH: 16.5, BOX_WIDTH: 40.32,
    SMALL_BOX_LENGTH: 5.5, SMALL_BOX_WIDTH: 18.32,
    PENALTY_SPOT: 11, CENTER_CIRCLE: 9.15, CORNER_ARC: 1,
    MARGIN: 6, // grass beyond lines
  },

  BALL: {
    RADIUS: 0.22,
    GRAVITY: -20,          // slightly gamey for snappier arcs
    AIR_DRAG: 0.18,        // per-second velocity fraction lost in air
    GROUND_FRICTION: 1.4,  // per-second fraction lost rolling
    RESTITUTION: 0.55,     // bounce energy retention
    STOP_SPEED: 0.25,
    MAGNUS: 5.2,           // curl strength factor (deterministic, from kick arg only)
    SPIN_DECAY: 1.6,
    MAX_SPEED: 38,         // hard cap on ground speed
    KICK_GRACE: 0.25,      // seconds the kicker can't re-collide with own kick
    BLOCK_DAMP_FAST: 0.45, // velocity kept when a fast ball hits a body
    BLOCK_DAMP_SLOW: 0.22, // velocity kept when a slow ball hits a body (control)
  },

  PLAYER: {
    RADIUS: 0.45,
    BASE_SPEED: 6.2,        // at pace 50
    PACE_SPEED_SPAN: 2.6,   // + span * (pace-50)/50
    SPRINT_MULT: 1.38,
    ACCEL: 18, TURN_RATE: 9.5,
    CONTROL_RADIUS: 1.15,   // can take a touch within this
    TOUCH_SPACING: 2.2,     // dribble knock-ahead distance
    SPRINT_TOUCH_MULT: 1.55,
    STAMINA_MAX: 100, SPRINT_DRAIN: 7.5, STAMINA_REGEN: 4.5,
    TIRED_SPEED_PENALTY: 0.82, // multiplier when stamina < 20
    DRIBBLE_OFFSET: 0.6,    // ball carried this far ahead of feet
    DRIBBLE_SPEED_MULT: 0.87, // dribble speed vs off-ball speed (DLS ~85-90%)
    FIRST_TOUCH_TIME: 0.22, // control delay when receiving a pass
    RETACKLE_COOLDOWN: 1.5, // failed tackler locked out this long
    PASS_ARRIVE_SPEED: 5.5, // ground passes arrive with this residual speed
    TACKLE_RANGE: 1.5, SLIDE_RANGE: 2.6, SLIDE_SPEED: 9.5,
    SLIDE_DURATION: 0.55, SLIDE_RECOVERY: 0.9,
    KICK_DURATION: 0.38, FALL_DURATION: 1.1,
    PASS_SPEED_MIN: 11, PASS_SPEED_MAX: 21,
    LONG_PASS_SPEED: 24, LONG_PASS_LIFT: 8.5,
    SHOT_POWER_MIN: 16, SHOT_POWER_MAX: 33,
    SHOT_LIFT_MAX: 7.5, SHOT_CHARGE_TIME: 0.85, // hold time for full power
    GK_DIVE_SPEED: 8.5, GK_DIVE_DURATION: 0.8,
  },

  AI: {
    DECISION_INTERVAL: 0.12,   // seconds between decisions per player (staggered)
    PRESSERS: 2,               // defenders actively chasing ball carrier
    PRESS_RADIUS: 26,          // only press when ball within this distance
    SHOOT_RANGE: 28, SHOOT_ANGLE_MIN: 0.22,
    PASS_OPENNESS_LANE: 2.2,   // lane clearance radius considered blocked
    CLEAR_PRESSURE_DIST: 3.2,
    SUPPORT_SHIFT: 0.42,       // how far formation shifts toward ball (0..1)
    LINE_DEPTH_SHIFT: 14,      // defensive line travel with ball x
    RUN_BEYOND: 8,             // striker depth-run distance
    GK_REACTION_BASE: 0.26,    // seconds, modified by stat & difficulty
    GK_DIST_RANGE: 16,         // gk considers shots from within
  },

  DIFFICULTY: {
    // decision: AI decision-interval multiplier (lower = faster reactions)
    // quality: chance the on-ball AI picks its best-scored option
    amateur: { label: 'Amateur', aiSpeed: 0.92, quality: 0.6,  gkReact: 1.5,  press: 0.7,  decision: 1.6 },
    pro:     { label: 'Pro',     aiSpeed: 1.0,  quality: 0.82, gkReact: 1.0,  press: 1.0,  decision: 1.0 },
    legend:  { label: 'Legend',  aiSpeed: 1.06, quality: 0.95, gkReact: 0.72, press: 1.35, decision: 0.7 },
  },

  CAMERA: {
    // V2 CameraController (DLS-style). Angles: atan(HEIGHT/DIST).
    FOV: 50,
    DIST_MIN: 0.8, DIST_MAX: 1.3,     // Camera Distance setting range (80–130%)
    FOLLOW_RATE: 4.2,                 // look-target damping rate
    POSITION_RATE: 3.4,               // camera position damping rate
    LOOKAHEAD_TIME: 0.55,             // seconds of ball velocity to lead by
    AIR_ZOOM: 5,                      // extra pullback when ball is high
    SHAKE_DECAY: 6,
    ORBIT_SPEED: 0.35,                // celebration / menu orbit
    OCCLUSION_INTERVAL: 0.25,         // seconds between occlusion ray sweeps

    SIDELINE:   { HEIGHT: 12, DIST: 22 },          // ~28.6° pitch angle, ~1/3 pitch framed
    BROADCAST:  { HEIGHT: 26, DIST: 40 },          // ~33° high TV gantry
    TOPDOWN:    { HEIGHT: 58, TILT_OFFSET: 6 },    // classic bird's-eye
    END_TO_END: { HEIGHT: 20, BEHIND_GOAL: 16 },   // behind defended goal
  },

  MATCH: {
    HALF_OPTIONS: [120, 180, 300],    // real seconds per half
    CLOCK_MINUTES_PER_HALF: 45,
    KICKOFF_DELAY: 1.6, RESTART_DELAY: 1.4,
    GOAL_CELEBRATION: 3.4, HALFTIME_PAUSE: 2.6,
    AUTO_SWITCH: true,
  },

  RENDER: {
    MAX_PIXEL_RATIO: 2,
    SHADOWS_DESKTOP: true,
    CROWD_FRAMES: 3, CROWD_FPS: 2.4,
    QUALITY_PROBE_SECONDS: 2.5, QUALITY_MIN_FPS: 45,
  },
};
