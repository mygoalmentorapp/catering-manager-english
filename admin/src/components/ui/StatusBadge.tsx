interface StatusBadgeProps {
  status: boolean | string;
  trueLabel?: string;
  falseLabel?: string;
}

export function StatusBadge({ status, trueLabel = "Active", falseLabel = "Disabled" }: StatusBadgeProps) {
  const isActive = status === true || status === "active";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {isActive ? trueLabel : falseLabel}
    </span>
  );
}
