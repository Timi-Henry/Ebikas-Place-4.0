import { currentUser } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { AddressBook } from "@/components/address-book";
import { CartProvider } from "@/components/cart-provider";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { StoreEffects } from "@/components/store-effects";
import { getUserAddresses } from "@/lib/server/addresses";

export default async function AddressesPage() {
  const user = await currentUser();
  const addresses = user ? await getUserAddresses(user.id) : [];

  return (
    <CartProvider>
      <main className="shell storefront-shell" id="main-content">
        <div className="bg-aurora" aria-hidden="true">
          <span className="aurora aurora-1" />
          <span className="aurora aurora-2" />
          <span className="aurora aurora-3" />
          <span className="aurora aurora-4" />
        </div>
        <div className="noise-overlay" aria-hidden="true" />
        <StoreEffects />
        <Nav />
        <section className="account-page">
          <div className="account-head">
            <span className="eyebrow">Account</span>
            <h1>Saved addresses</h1>
            <p>Manage saved delivery addresses for faster checkout.</p>
          </div>
          {user ? (
            <AddressBook initialAddresses={addresses} userDefaults={{
              fullName: user.fullName || "",
              email:
                user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ||
                user.primaryEmailAddress?.emailAddress ||
                ""
            }} />
          ) : (
            <div className="admin-denied">
              <strong>Sign in required</strong>
              <p>Sign in to add, edit, or delete saved delivery addresses.</p>
              <SignInButton mode="modal">
                <button className="btn-primary" type="button">Sign in</button>
              </SignInButton>
            </div>
          )}
        </section>
        <Footer />
      </main>
    </CartProvider>
  );
}
