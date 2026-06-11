type StatProps = {
  label: string;
  value: string | number;
};

export function Stat({ label, value }: StatProps) {
  return (
    <div className="statItem">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
