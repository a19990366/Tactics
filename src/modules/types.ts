export type Team = "A" | "B";
export type AttackType = "Physical" | "Magical";

export type TargetGroup = "single" | "group";
export type TargetTeam = "enemy" | "ally" | "both";

export type AreaSpec =
  | { kind: "Line" } // 四方向直線（1×range）
  | { kind: "Rect"; rectW: number; rectD: number } // 面向矩形
  | { kind: "SelfMov" }; // 自身為中心，曼哈頓半徑 = MOV

export type StatKey =
  | "ATK"
  | "DEF"
  | "MATK"
  | "MDEF"
  | "ACC"
  | "EVA"
  | "CR"
  | "SPD"
  | "MOV"
  | "BLK"
  | "mpRegen";

export type BuffSpec = {
  name: string;
  turns: number;
  add?: Partial<Record<StatKey, number>>;
  mul?: Partial<Record<StatKey, number>>;
  postDR?: Partial<{ physical: number; magical: number }>;
  postDMG?: number;
};

export type BuffInstance = BuffSpec & { id: string };

export type Skill = {
  id: string;
  name: string;
  type: AttackType;
  multiplier: number;
  mpCost: number;
  rangeFront: number;
  isBasic?: boolean;

  area: AreaSpec;
  targetGroup: TargetGroup;
  targetTeam: TargetTeam;

  effects?: {
    healHP?: number;
    restoreMP?: number;
    applyBuff?: { to: "self" | "area"; buff: BuffSpec };
  };
};

export type Passive = {
  name: string;
  defMul?: number;
  mpRegenMul?: number;
  addCR?: number;
  finalEvadeMinusHit?: number;
  baseAdd?: Partial<Record<StatKey, number>>;
  baseMul?: Partial<Record<StatKey, number>>;
  postDR?: Partial<{ physical: number; magical: number }>;
};

export type UnitTemplate = {
  cls: "Swordsman" | "Mage" | "Archer" | "Rogue" | "ADMIN";
  maxHP: number;
  maxMP: number;
  ATK: number;
  DEF: number;
  MATK: number;
  MDEF: number;
  ACC: number;
  EVA: number;
  CR: number;
  SPD: number;
  MOV: number;
  BLK: number;
  passive: Passive;
  skills: Skill[];
  finalDR: { physical: number; magical: number };
};

export type Unit = {
  id: string;
  team: Team;
  x: number;
  y: number;

  base: Record<StatKey, number>;

  maxHP: number;
  maxMP: number;
  hp: number;
  mp: number;

  cls: UnitTemplate["cls"];
  skills: Skill[];
  finalDRBase: { physical: number; magical: number };

  buffs: BuffInstance[];

  alive: boolean;
  actedThisTurn: boolean;
  movedThisTurn: boolean;
};

export type GameState = {
  width: number;
  height: number;
  units: Unit[];
  rSPD: Record<string, number>;
  turnOrder: string[];
  turnIndex: number;
  phase: "idle" | "select-action" | "select-move" | "select-target";
  selectedUnitId?: string;
  selectedSkillId?: string;
  mode: "PvP" | "PvE";
};
