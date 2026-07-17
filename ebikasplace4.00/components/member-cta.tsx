"use client";

import { Gift, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { SignInButton, useUser } from "@clerk/nextjs";

export function MemberCta() {
  const { isLoaded, isSignedIn, user } = useUser();
  const publicMetadata = user?.publicMetadata as { role?: string; admin?: boolean } | undefined;
  const isAdmin = publicMetadata?.role === "admin" || publicMetadata?.admin === true;

  return (
    <section className="featured-cta" id="member">
      <div className="glass-card-large reveal">
        <div className="glass-pill">
          <Gift size={16} />
          <span>Member tools</span>
        </div>
        <h2>Shop faster with your account</h2>
        <p>Sign in to keep your wishlist, saved addresses, order history, and repeat orders in one place.</p>
        {isLoaded && isAdmin ? (
          <a className="btn-primary" href="/admin">
            <ShieldCheck size={18} />
            <span>Admin dashboard</span>
          </a>
        ) : null}
        {isLoaded && !isSignedIn ? (
          <SignInButton mode="modal">
            <button className="btn-primary" type="button">
              <UserRound size={18} />
              <span>Sign in free</span>
            </button>
          </SignInButton>
        ) : null}
        {isLoaded && isSignedIn && !isAdmin ? (
          <a className="btn-primary" href="/shop">
            <Sparkles size={18} />
            <span>Continue shopping</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
