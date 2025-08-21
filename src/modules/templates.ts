import templatesData from "../data/templates.json";
import type { UnitTemplate } from "./types";

export const Templates = templatesData as Record<string, UnitTemplate>;
export type ClassKey = keyof typeof Templates;

export const CLASS_LIST = Object.keys(Templates) as ClassKey[];
export const RANDOM_CLASS_LIST = CLASS_LIST;
