import { PassField, Runner } from '../types';

// ค่าที่ตัวนำเข้าข้อมูลใส่แทนช่องว่าง เป็นแค่ marker ของฝั่ง admin
// ไม่ใช่ข้อความที่นักวิ่งควรเห็นบนการ์ด จึงถือว่าเป็นค่าว่าง
const PLACEHOLDER_VALUES = ['n/a', 'not specified'];

export const isPlaceholderValue = (value: string) =>
  PLACEHOLDER_VALUES.includes(value.trim().toLowerCase());

// อ่านค่าจาก runner โดยแปลง null/undefined/placeholder ให้เป็นค่าว่าง
export const getRunnerValue = (runner: Runner, key: string): string => {
  const val = runner[key as keyof Runner];
  if (val === undefined || val === null) return '';
  const str = String(val);
  return isPlaceholderValue(str) ? '' : str;
};

export type PassFieldConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

// ตัวเลือกที่หน้า config เอาไปทำ dropdown — เก็บไว้ที่เดียวกับตัวประเมินผล
// เพื่อไม่ให้ label กับตรรกะจริงหลุดจากกัน
export const PASS_FIELD_CONDITION_OPERATORS: {
  value: PassFieldConditionOperator;
  label: string;
  needsValue: boolean;
}[] = [
  { value: 'equals', label: 'เท่ากับ (equals)', needsValue: true },
  { value: 'not_equals', label: 'ไม่เท่ากับ (not equals)', needsValue: true },
  { value: 'contains', label: 'มีคำว่า (contains)', needsValue: true },
  { value: 'is_empty', label: 'ว่าง (is empty)', needsValue: false },
  { value: 'is_not_empty', label: 'ไม่ว่าง (is not empty)', needsValue: false },
];

export const conditionOperatorNeedsValue = (operator?: PassFieldConditionOperator) =>
  PASS_FIELD_CONDITION_OPERATORS.find(o => o.value === (operator || 'equals'))?.needsValue ?? true;

// เทียบค่าแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ และตัดช่องว่างหัวท้าย เพราะข้อมูลมาจาก
// CSV ที่พิมพ์มือ ('Yes' / 'YES ' ควรถือว่าเป็นค่าเดียวกัน)
const normalize = (value: string) => value.trim().toLowerCase();

/**
 * field ตัวนี้ควรแสดงบนการ์ดของนักวิ่งคนนี้หรือไม่
 *
 * field ที่ไม่ได้ตั้งเงื่อนไข (ค่า default ของทุก template เดิม) จะแสดงเสมอ
 */
export const isFieldVisibleForRunner = (field: PassField, runner: Runner): boolean => {
  if (!field.conditionEnabled) return true;
  // ติ๊กว่ามีเงื่อนไขแต่ยังไม่ได้เลือก field — ถือว่ายังไม่มีเงื่อนไข ดีกว่าซ่อนทิ้งเงียบ ๆ
  if (!field.conditionField) return true;

  const actual = getRunnerValue(runner, field.conditionField);
  const expected = field.conditionValue || '';

  switch (field.conditionOperator || 'equals') {
    case 'not_equals':
      return normalize(actual) !== normalize(expected);
    case 'contains':
      return normalize(expected) === '' || normalize(actual).includes(normalize(expected));
    case 'is_empty':
      return actual === '';
    case 'is_not_empty':
      return actual !== '';
    case 'equals':
    default:
      return normalize(actual) === normalize(expected);
  }
};
