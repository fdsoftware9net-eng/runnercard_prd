import React from 'react';
import { PassField, Runner } from '../types';
import { RUNNER_COLUMNS } from '../defaults';
import {
    PASS_FIELD_CONDITION_OPERATORS,
    PassFieldConditionOperator,
    conditionOperatorNeedsValue,
} from '../utils/passFieldCondition';
import Select from './Select';
import Input from './Input';

interface FieldConditionEditorProps {
    field: PassField;
    onChange: (updates: Partial<PassField>) => void;
}

// ค่าเริ่มต้นตอนติ๊กเปิดเงื่อนไข — เลือก vip ไว้ให้เพราะเป็นเคสที่ใช้บ่อยที่สุด
// (ยังเปลี่ยนเป็นคอลัมน์อื่นได้ทั้งหมด)
const DEFAULT_CONDITION_FIELD: keyof Runner = 'vip';

/**
 * เงื่อนไขการแสดงของ field หนึ่งช่องบนการ์ด
 *
 * ใช้ร่วมกันทั้ง 3 หน้า config (web pass, bib card 1, bib card 2) เพราะทุกหน้า
 * แก้ PassField ตัวเดียวกัน — ตัวที่เอาไปตัดสินตอนวาดจริงคือ
 * isFieldVisibleForRunner() ใน utils/passFieldCondition.ts
 */
const FieldConditionEditor: React.FC<FieldConditionEditorProps> = ({ field, onChange }) => {
    const operator = (field.conditionOperator || 'equals') as PassFieldConditionOperator;
    const needsValue = conditionOperatorNeedsValue(operator);

    return (
        <div className="pt-2 border-t border-gray-600 space-y-2">
            <div className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    id={`conditionEnabled-${field.id}`}
                    checked={!!field.conditionEnabled}
                    onChange={(e) => {
                        if (e.target.checked) {
                            onChange({
                                conditionEnabled: true,
                                conditionField: field.conditionField || DEFAULT_CONDITION_FIELD,
                                conditionOperator: field.conditionOperator || 'equals',
                                conditionValue: field.conditionValue || '',
                            });
                        } else {
                            // เก็บค่าที่ตั้งไว้ไว้เหมือนเดิม เผื่อติ๊กกลับมาใหม่ —
                            // ตอนวาดจริงดูแค่ conditionEnabled อยู่แล้ว
                            onChange({ conditionEnabled: false });
                        }
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                    htmlFor={`conditionEnabled-${field.id}`}
                    className="text-sm font-medium text-gray-300 select-none cursor-pointer"
                >
                    มีเงื่อนไขการแสดง (Conditional Display)
                </label>
            </div>

            {!field.conditionEnabled ? (
                <p className="text-xs text-gray-400">ไม่มีเงื่อนไข — แสดงกับนักวิ่งทุกคน</p>
            ) : (
                <div className="space-y-2 bg-gray-800/60 p-3 rounded-md">
                    <p className="text-xs text-gray-400">
                        แสดงเฉพาะเมื่อข้อมูลของนักวิ่งตรงตามเงื่อนไขนี้
                        (หน้า config จะแสดงเสมอเพื่อให้จัดตำแหน่งได้)
                    </p>
                    <Select
                        id={`conditionField-${field.id}`}
                        label="Field"
                        value={field.conditionField || DEFAULT_CONDITION_FIELD}
                        onChange={(e) => onChange({ conditionField: e.target.value as keyof Runner })}
                    >
                        {RUNNER_COLUMNS.map(col => <option key={col} value={col}>{col}</option>)}
                    </Select>
                    <Select
                        id={`conditionOperator-${field.id}`}
                        label="Operator"
                        value={operator}
                        onChange={(e) => onChange({ conditionOperator: e.target.value as PassFieldConditionOperator })}
                    >
                        {PASS_FIELD_CONDITION_OPERATORS.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </Select>
                    {needsValue && (
                        <Input
                            id={`conditionValue-${field.id}`}
                            name="conditionValue"
                            label="Value"
                            value={field.conditionValue || ''}
                            onChange={(e) => onChange({ conditionValue: e.target.value })}
                            placeholder="e.g., YES"
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default FieldConditionEditor;
