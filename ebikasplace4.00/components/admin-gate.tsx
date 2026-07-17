"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { AdminInventory } from "@/components/admin-inventory";
import { AdminProductForm } from "@/components/admin-product-form";
import type { Product } from "@/lib/types";

export function AdminGate({ products = [] }: { products?: Product[] }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const publicMetadata = user?.publicMetadata as { role?: string; admin?: boolean } | undefined;
  const isAdmin = publicMetadata?.role === "admin" || publicMetadata?.admin === true;

  if (!isLoaded) {
    return <p className="notice">Checking your session...</p>;
  }

  if (!isSignedIn) {
    return (
      <div style={{ marginTop: 24 }}>
        <SignInButton mode="modal">
          <button className="primary-button" type="button">
            Sign in to continue
          </button>
        </SignInButton>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-denied">
        <strong>Admin access only</strong>
        <p>Your account is signed in, but it has not been marked as an Ebikas Place admin in Clerk.</p>
      </div>
    );
  }

  return (
    <>
      <AdminProductForm />
      <AdminInventory products={products} />
    </>
  );
}
