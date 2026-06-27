export default function LogoIcon({ size = 36 }) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="Cashflow"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
