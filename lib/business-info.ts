import { productCategories } from "@/lib/product-taxonomy";

export const businessInfo = {
  name: "Ebika's Place",
  tagline: "Where style meets fashion",
  phone: "09061199345",
  phoneHref: "tel:09061199345",
  whatsappHref: "https://wa.me/2349061199345",
  pickupAddress: "No. 19 Remoye Street, Akowonjo, Lagos State",
  deliveryArea: "Lagos State, Nigeria",
  deliveryNote: "Delivery is currently available within Lagos State only."
};

export const primaryCategoryLinks = [
  { label: "Men", href: "/shop?family=clothing&audience=men", value: "men" },
  { label: "Women", href: "/shop?family=clothing&audience=women", value: "women" },
  { label: "Kids", href: "/shop?family=clothing&audience=kids", value: "kids" },
  { label: "Shoes", href: "/shop?family=footwear", value: "footwear" },
  { label: "Bags", href: "/shop?family=bags", value: "bags" },
  { label: "Accessories", href: "/shop?family=accessories", value: "accessories" }
];

export const footerCategoryLinks = primaryCategoryLinks.map((link) => ({
  ...link,
  label: productCategories.find((category) => category.value === link.value)?.label || link.label
}));
