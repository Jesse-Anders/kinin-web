export function Page({ children, className = "", ...rest }) {
  return (
    <div className={`km-page ${className}`} {...rest}>
      {children}
    </div>
  );
}
