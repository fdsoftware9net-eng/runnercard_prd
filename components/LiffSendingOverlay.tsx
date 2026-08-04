import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import Button from './Button';

export type LiffPipelineStep =
  | 'verifying'
  | 'generating'
  | 'uploading'
  | 'registering'
  | 'sending'
  | 'success'
  | 'error';

interface LiffSendingOverlayProps {
  step: LiffPipelineStep;
  errorMessage?: string | null;
  onRetry: () => void;
  onViewInBrowser: () => void;
  /** Dev-only banner text describing which parts of the flow are mocked. Omit in production. */
  devNotice?: string | null;
}

const STEP_MESSAGES: Record<Exclude<LiffPipelineStep, 'error' | 'success'>, string> = {
  verifying: 'กำลังตรวจสอบข้อมูล...',
  generating: 'กำลังสร้างบัตร...',
  uploading: 'กำลังอัปโหลดรูปภาพ...',
  registering: 'กำลังลงทะเบียน...',
  sending: 'กำลังส่งเข้า LINE...',
};

const LiffSendingOverlay: React.FC<LiffSendingOverlayProps> = ({
  step,
  errorMessage,
  onRetry,
  onViewInBrowser,
  devNotice,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm bg-gray-800 rounded-lg shadow-lg p-6 text-center">
        {devNotice && (
          <div className="mb-4 inline-block rounded-full bg-yellow-500/20 border border-yellow-500 px-3 py-1 text-xs font-semibold text-yellow-300">
            {devNotice}
          </div>
        )}

        {step === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600">
              <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-white">ส่งสำเร็จ ✓</p>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
              <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white font-semibold mb-2">เกิดข้อผิดพลาด</p>
            <p className="text-gray-300 text-sm mb-6">{errorMessage || 'ไม่สามารถส่งบัตรเข้า LINE ได้ กรุณาลองใหม่อีกครั้ง'}</p>
            <div className="space-y-3">
              <Button onClick={onRetry} className="w-full">ลองใหม่</Button>
              <button
                type="button"
                onClick={onViewInBrowser}
                className="w-full text-sm text-gray-400 hover:text-white underline"
              >
                ดูบัตรในเบราว์เซอร์แทน
              </button>
            </div>
          </>
        )}

        {step !== 'success' && step !== 'error' && (
          <>
            <LoadingSpinner message="" />
            <p className="mt-2 text-white">{STEP_MESSAGES[step]}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default LiffSendingOverlay;
