export function AdminAccessDenied({ message = "Admin access required." }: { message?: string }) {
  return (
    <div className="admin-denied">
      <strong>Admin access only</strong>
      <p>{message}</p>
    </div>
  );
}
