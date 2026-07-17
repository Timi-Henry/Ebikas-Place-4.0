import { ArrowRight, MapPin, MessageCircle, PackageCheck, Phone, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import Link from "next/link";
import { businessInfo, footerCategoryLinks } from "@/lib/business-info";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-service-band">
        <div>
          <Truck size={22} />
          <span><strong>Delivery &amp; pickup</strong><small>Choose what works at checkout</small></span>
        </div>
        <div>
          <MapPin size={22} />
          <span><strong>Rider pickup</strong><small>Collect from our Akowonjo store</small></span>
        </div>
        <div>
          <PackageCheck size={22} />
          <span><strong>Order tracking</strong><small>Follow progress from your account</small></span>
        </div>
        <div>
          <ShieldCheck size={22} />
          <span><strong>Secure shopping</strong><small>Protected sign-in and saved details</small></span>
        </div>
      </div>

      <div className="site-footer-grid">
        <div className="footer-brand">
          <Link className="brand footer-logo" href="/">
            <span className="brand-mark">E</span>
            <span className="brand-copy">
              <strong>Ebika’s <b>Place</b></strong>
              <small>Online fashion store</small>
            </span>
          </Link>
          <p>
            Clothing, shoes, bags, and accessories for women, men, and kids—selected for everyday wear.
          </p>
          <div className="footer-contact-row">
            <a href={businessInfo.phoneHref}><Phone size={16} /> {businessInfo.phone}</a>
            <a href={businessInfo.whatsappHref}><MessageCircle size={16} /> Chat on WhatsApp</a>
          </div>
        </div>

        <nav aria-label="Footer shop categories">
          <strong>Shop</strong>
          {footerCategoryLinks.map((link) => (
            <Link href={link.href} key={link.value}>{link.label}</Link>
          ))}
          <Link href="/shop">View all products</Link>
        </nav>

        <nav aria-label="Customer help">
          <strong>Customer care</strong>
          <Link href="/addresses">Saved addresses</Link>
          <Link href="/#featured">Featured styles</Link>
          <Link href="/#about">About Ebika’s Place</Link>
          <a href={businessInfo.phoneHref}>Call to order</a>
          <a href={businessInfo.whatsappHref}>WhatsApp support</a>
        </nav>

        <div className="footer-location">
          <strong>Visit or send a rider</strong>
          <p><MapPin size={17} /> {businessInfo.pickupAddress}</p>
          <p><ShoppingBag size={17} /> Call or WhatsApp before sending a rider.</p>
          <a className="footer-direction-link" href={businessInfo.whatsappHref}>
            Confirm pickup details <ArrowRight size={16} />
          </a>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} {businessInfo.name}. All rights reserved.</span>
        <span>Shop online or visit us in store.</span>
      </div>
    </footer>
  );
}
