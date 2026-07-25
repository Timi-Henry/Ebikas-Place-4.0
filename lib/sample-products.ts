import type { Product, ProductSize } from "@/lib/types";

type SampleProductInput = Omit<Product, "imageUrl" | "imageUrls"> & {
  gallery: string[];
  sizes: ProductSize[];
};

function imageUrl(photoId: string) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=900&q=85`;
}

const galleries = {
  mensOxford: [
    "photo-1521572163474-6864f9cf17ab",
    "photo-1489987707025-afc232f7ea0f",
    "photo-1523381210434-271e8be1f52b",
    "photo-1512436991641-6745cdb1723f",
    "photo-1551488831-00ddcb6c6bd3"
  ],
  mensChino: [
    "photo-1473966968600-fa801b869a1a",
    "photo-1515886657613-9f3515b0c78f",
    "photo-1506629905607-d405d7d3b0d2",
    "photo-1487222477894-8943e31ef7b2",
    "photo-1507680434567-5739c80be1ac"
  ],
  mensShorts: [
    "photo-1503342217505-b0a15ec3261c",
    "photo-1515886657613-9f3515b0c78f",
    "photo-1492447166138-50c3889fccb1",
    "photo-1529139574466-a303027c1d8b",
    "photo-1506629905607-d405d7d3b0d2"
  ],
  womensBlouse: [
    "photo-1485462537746-965f33f7f6a7",
    "photo-1529139574466-a303027c1d8b",
    "photo-1515372039744-b8f02a3ae446",
    "photo-1496747611176-843222e1e57c",
    "photo-1539008835657-9e8e9680c956"
  ],
  womensDress: [
    "photo-1496747611176-843222e1e57c",
    "photo-1539008835657-9e8e9680c956",
    "photo-1515372039744-b8f02a3ae446",
    "photo-1485462537746-965f33f7f6a7",
    "photo-1503342217505-b0a15ec3261c"
  ],
  womensPants: [
    "photo-1529139574466-a303027c1d8b",
    "photo-1515886657613-9f3515b0c78f",
    "photo-1487222477894-8943e31ef7b2",
    "photo-1503341455253-b2e723bb3dbb",
    "photo-1523381210434-271e8be1f52b"
  ],
  kidsSet: [
    "photo-1503454537195-1dcabb73ffb9",
    "photo-1519238263530-99bdd11df2ea",
    "photo-1546015720-b8b30df5aa27",
    "photo-1522771930-78848d9293e8",
    "photo-1471286174890-9c112ffca5b4"
  ],
  kidsDress: [
    "photo-1546015720-b8b30df5aa27",
    "photo-1503454537195-1dcabb73ffb9",
    "photo-1519238263530-99bdd11df2ea",
    "photo-1471286174890-9c112ffca5b4",
    "photo-1522771930-78848d9293e8"
  ],
  kidsPants: [
    "photo-1519238263530-99bdd11df2ea",
    "photo-1503454537195-1dcabb73ffb9",
    "photo-1471286174890-9c112ffca5b4",
    "photo-1546015720-b8b30df5aa27",
    "photo-1522771930-78848d9293e8"
  ],
  mensSneakers: [
    "photo-1549298916-b41d501d3772",
    "photo-1460353581641-37baddab0fa2",
    "photo-1543163521-1bf539c55dd2",
    "photo-1608231387042-66d1773070a5",
    "photo-1515955656352-a1fa3ffcd111"
  ],
  womensHeels: [
    "photo-1543163521-1bf539c55dd2",
    "photo-1460353581641-37baddab0fa2",
    "photo-1491553895911-0055eca6402d",
    "photo-1549298916-b41d501d3772",
    "photo-1608231387042-66d1773070a5"
  ],
  sandals: [
    "photo-1603487742131-4160ec999306",
    "photo-1603808033192-082d6919d3e1",
    "photo-1562273138-f46be4ebdf33",
    "photo-1542291026-7eec264c27ff",
    "photo-1515955656352-a1fa3ffcd111"
  ],
  hoops: [
    "photo-1535632066927-ab7c9ab60908",
    "photo-1515562141207-7a88fb7ce338",
    "photo-1605100804763-247f67b3557e",
    "photo-1611652022419-a9419f74343d",
    "photo-1506630448388-4e683c67ddb0"
  ],
  belt: [
    "photo-1553062407-98eeb64c6a62",
    "photo-1512436991641-6745cdb1723f",
    "photo-1523381210434-271e8be1f52b",
    "photo-1489987707025-afc232f7ea0f",
    "photo-1544441893-675973e31985"
  ],
  scarf: [
    "photo-1485968579580-b6d095142e6e",
    "photo-1485462537746-965f33f7f6a7",
    "photo-1515372039744-b8f02a3ae446",
    "photo-1529139574466-a303027c1d8b",
    "photo-1496747611176-843222e1e57c"
  ],
  tote: [
    "photo-1548036328-c9fa89d128fa",
    "photo-1584917865442-de89df76afd3",
    "photo-1594223274512-ad4803739b7c",
    "photo-1553062407-98eeb64c6a62",
    "photo-1590874103328-eac8a683ce7c"
  ],
  crossbody: [
    "photo-1584917865442-de89df76afd3",
    "photo-1594223274512-ad4803739b7c",
    "photo-1548036328-c9fa89d128fa",
    "photo-1590874103328-eac8a683ce7c",
    "photo-1553062407-98eeb64c6a62"
  ],
  clutch: [
    "photo-1594223274512-ad4803739b7c",
    "photo-1548036328-c9fa89d128fa",
    "photo-1584917865442-de89df76afd3",
    "photo-1590874103328-eac8a683ce7c",
    "photo-1553062407-98eeb64c6a62"
  ]
} as const;

function withGallery({ gallery, ...product }: SampleProductInput): Product {
  const images = gallery.map(imageUrl);
  return {
    ...product,
    imageUrl: images[0],
    imageUrls: images.slice(1)
  };
}

export const sampleProducts: Product[] = [
  withGallery({
    id: "64f000000000000000000001",
    name: "Crisp cotton oxford shirt",
    description: "A clean everyday button-down cut from breathable cotton with a structured collar and easy Lagos-weekend polish.",
    category: "mens-clothing",
    subcategory: "shirts",
    gallery: [...galleries.mensOxford],
    price: 18500,
    salePrice: 15900,
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 18,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000002",
    name: "Tapered stretch chino pants",
    description: "Soft stretch chinos with a tapered leg, deep pockets, and a sharp fit for work, dinner, or relaxed Fridays.",
    category: "mens-clothing",
    subcategory: "pants",
    gallery: [...galleries.mensChino],
    price: 26000,
    salePrice: 21900,
    sizes: ["M", "L", "XL", "XXL"],
    stock: 14,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000003",
    name: "Washed linen drawstring shorts",
    description: "Lightweight linen-blend shorts with a relaxed drawstring waist and a clean hem for warm days.",
    category: "mens-clothing",
    subcategory: "shorts",
    gallery: [...galleries.mensShorts],
    price: 14500,
    sizes: ["S", "M", "L", "XL"],
    stock: 20,
    featured: false
  }),
  withGallery({
    id: "64f000000000000000000004",
    name: "Soft satin drape blouse",
    description: "A fluid satin blouse with a relaxed neckline, gentle sheen, and an easy tuck-in length.",
    category: "womens-clothing",
    subcategory: "tops",
    gallery: [...galleries.womensBlouse],
    price: 21000,
    sizes: ["S", "M", "L", "XL"],
    stock: 16,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000005",
    name: "Printed wrap midi dress",
    description: "A flattering wrap midi dress with a soft waist tie, modest neckline, and movement-friendly skirt.",
    category: "womens-clothing",
    subcategory: "dresses",
    gallery: [...galleries.womensDress],
    price: 34000,
    salePrice: 28900,
    sizes: ["S", "M", "L", "XL", "XXL"],
    stock: 11,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000006",
    name: "High-waist wide-leg pants",
    description: "Polished high-waist trousers with a soft wide leg and a comfortable structured waistband.",
    category: "womens-clothing",
    subcategory: "pants",
    gallery: [...galleries.womensPants],
    price: 28500,
    sizes: ["S", "M", "L", "XL"],
    stock: 15,
    featured: false
  }),
  withGallery({
    id: "64f000000000000000000007",
    name: "Kids weekend shirt set",
    description: "A cheerful matching kids set with a soft shirt and coordinating shorts made for play and family outings.",
    category: "childrens-clothing",
    subcategory: "sets",
    gallery: [...galleries.kidsSet],
    price: 17500,
    salePrice: 14900,
    sizes: ["S", "M", "L"],
    stock: 24,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000008",
    name: "Little celebration dress",
    description: "A sweet children’s dress with a soft lining, gentle volume, and easy back closure.",
    category: "childrens-clothing",
    subcategory: "dresses",
    gallery: [...galleries.kidsDress],
    price: 22000,
    sizes: ["S", "M", "L", "XL"],
    stock: 10,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000009",
    name: "Kids pull-on cotton pants",
    description: "Durable cotton pants with an elastic waist, roomy pockets, and a neat everyday shape.",
    category: "childrens-clothing",
    subcategory: "pants",
    gallery: [...galleries.kidsPants],
    price: 13500,
    sizes: ["S", "M", "L", "XL"],
    stock: 22,
    featured: false
  }),
  withGallery({
    id: "64f00000000000000000000a",
    name: "Clean everyday sneakers",
    description: "Low-profile sneakers with a neat finish, padded collar, and versatile styling for casual Lagos days.",
    category: "shoes",
    subcategory: "sneakers",
    gallery: [...galleries.mensSneakers],
    price: 29500,
    salePrice: 25500,
    sizes: [],
    stock: 12,
    featured: true
  }),
  withGallery({
    id: "64f00000000000000000000b",
    name: "Polished evening heels",
    description: "A dressy heel with a clean silhouette, secure strap, and refined finish for outings and occasions.",
    category: "shoes",
    subcategory: "heels",
    gallery: [...galleries.womensHeels],
    price: 31500,
    sizes: [],
    stock: 8,
    featured: true
  }),
  withGallery({
    id: "64f00000000000000000000c",
    name: "Soft strap sandals",
    description: "Comfortable open sandals with soft straps and an easy everyday profile for warm weather styling.",
    category: "shoes",
    subcategory: "sandals",
    gallery: [...galleries.sandals],
    price: 18500,
    sizes: [],
    stock: 15,
    featured: false
  }),
  withGallery({
    id: "64f00000000000000000000d",
    name: "Polished gold hoop earrings",
    description: "Lightweight polished hoops with a secure clasp and a warm finish that works with casual or dressy looks.",
    category: "accessories",
    subcategory: "jewelry",
    gallery: [...galleries.hoops],
    price: 8500,
    salePrice: 6900,
    sizes: [],
    stock: 30,
    featured: true
  }),
  withGallery({
    id: "64f00000000000000000000e",
    name: "Slim leather keeper belt",
    description: "A smooth leather belt with tonal stitching and a compact buckle for trousers, denim, and skirts.",
    category: "accessories",
    subcategory: "belts",
    gallery: [...galleries.belt],
    price: 12500,
    sizes: ["S", "M", "L", "XL"],
    stock: 18,
    featured: false
  }),
  withGallery({
    id: "64f00000000000000000000f",
    name: "Printed silk-feel scarf",
    description: "A smooth printed scarf that can be worn around the neck, hair, wrist, or tied to a bag handle.",
    category: "accessories",
    subcategory: "scarves",
    gallery: [...galleries.scarf],
    price: 10500,
    sizes: [],
    stock: 26,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000010",
    name: "Structured everyday tote",
    description: "A roomy structured tote with sturdy handles, clean seams, and enough space for daily essentials.",
    category: "bags",
    subcategory: "totes",
    gallery: [...galleries.tote],
    price: 32500,
    salePrice: 27900,
    sizes: [],
    stock: 13,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000011",
    name: "Compact crossbody bag",
    description: "A hands-free crossbody with an adjustable strap, neat compartments, and a polished everyday profile.",
    category: "bags",
    subcategory: "crossbody-bags",
    gallery: [...galleries.crossbody],
    price: 24500,
    sizes: [],
    stock: 17,
    featured: true
  }),
  withGallery({
    id: "64f000000000000000000012",
    name: "Minimal evening clutch",
    description: "A slim clutch with a soft sheen, magnetic closure, and space for phone, cards, and small essentials.",
    category: "bags",
    subcategory: "clutches",
    gallery: [...galleries.clutch],
    price: 21500,
    salePrice: 17900,
    sizes: [],
    stock: 9,
    featured: false
  })
];
