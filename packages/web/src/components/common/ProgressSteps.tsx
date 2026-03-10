interface ProgressStepsProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
}

export default function ProgressSteps({ currentStep, totalSteps, steps }: ProgressStepsProps) {
  return (
    <div className="mb-8">
      {/* 단계 표시 */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-medium text-gray-600">
          단계 {currentStep}/{totalSteps}
        </span>
      </div>

      {/* 진행 바 */}
      <div className="relative">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* 단계 이름 표시 */}
      <div className="flex justify-between mt-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`text-xs ${
              index + 1 <= currentStep
                ? 'text-blue-600 font-semibold'
                : 'text-gray-400'
            }`}
          >
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}
