import { createHash } from "node:crypto";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

const clothingPhotos = [
  "photo-1521572163474-6864f9cf17ab",
  "photo-1489987707025-afc232f7ea0f",
  "photo-1523381210434-271e8be1f52b",
  "photo-1485462537746-965f33f7f6a7",
  "photo-1515372039744-b8f02a3ae446",
  "photo-1496747611176-843222e1e57c",
  "photo-1539008835657-9e8e9680c956",
  "photo-1473966968600-fa801b869a1a",
  "photo-1503342217505-b0a15ec3261c",
  "photo-1503454537195-1dcabb73ffb9",
  "photo-1546015720-b8b30df5aa27",
  "photo-1551488831-00ddcb6c6bd3"
];
const shoePhotos = [
  "photo-1549298916-b41d501d3772",
  "photo-1460353581641-37baddab0fa2",
  "photo-1543163521-1bf539c55dd2",
  "photo-1603487742131-4160ec999306",
  "photo-1603808033192-082d6919d3e1",
  "photo-1491553895911-0055eca6402d",
  "photo-1608231387042-66d1773070a5",
  "photo-1515955656352-a1fa3ffcd111"
];
const bagPhotos = [
  "photo-1548036328-c9fa89d128fa",
  "photo-1584917865442-de89df76afd3",
  "photo-1594223274512-ad4803739b7c",
  "photo-1553062407-98eeb64c6a62",
  "photo-1584917865442-de89df76afd3"
];
const accessoryPhotos = [
  "photo-1535632066927-ab7c9ab60908",
  "photo-1515562141207-7a88fb7ce338",
  "photo-1523275335684-37898b6baf30",
  "photo-1553062407-98eeb64c6a62",
  "photo-1485968579580-b6d095142e6e",
  "photo-1511499767150-a48a237f0083"
];
const cameraPhotos = [
  "photo-1516035069371-29a1b244cc32",
  "photo-1502920917128-1aa500764cbd",
  "photo-1542038784456-1ea8e935640e",
  "photo-1581591524425-c7e0978865fc",
  "photo-1542038784456-1ea8e935640e"
];

const products = [
  ["shirts", "Amazon Essentials Men's Regular-Fit Long-Sleeve Oxford Shirt", "A classic cotton Oxford button-down with a neat collar and an easy, versatile fit for work or weekends.", 28900, "photo-1521572163474-6864f9cf17ab", "men", "S-XXL"],
  ["shirts", "Wrangler Authentics Men's Long Sleeve Button-Down Shirt", "A casual long-sleeve button-down with a relaxed profile and a durable everyday feel.", 34900, "photo-1489987707025-afc232f7ea0f", "men", "S-XXL"],
  ["t-shirts", "Gildan Men's Crew T-Shirts, Multipack", "A multipack of everyday crew-neck tees with a simple silhouette for layering or wearing on their own.", 22500, "photo-1523381210434-271e8be1f52b", "men", "S-XXL"],
  ["t-shirts", "Amazon Essentials Men's Slim-Fit Short-Sleeve Crewneck Pocket T-Shirt, Pack of 2", "A two-pack of slim-fit jersey tees with a crew neckline and chest pocket.", 26500, "https://m.media-amazon.com/images/I/81AOXMrJg1L.jpg", "men", "S-XXL", "B0CD86ZVRS"],
  ["polos", "Amazon Essentials Men's Regular-Fit Cotton Pique Polo Shirt", "A classic cotton-pique polo with a ribbed collar and short sleeves for smart-casual outfits.", 27900, "photo-1521572163474-6864f9cf17ab", "men", "S-XXL"],
  ["polos", "Under Armour Men's Tech Golf Polo", "A lightweight performance polo with a clean collar, designed for golf, training, and everyday wear.", 48500, "https://m.media-amazon.com/images/I/91Ce2xxo-wL._AC_SL1500_.jpg", "men", "S-XXL"],
  ["tops", "Amazon Essentials Women's Classic-Fit Short-Sleeve V-Neck T-Shirt", "A soft cotton-modal V-neck tee with a classic fit and easy short sleeves.", 21500, "https://m.media-amazon.com/images/I/81AOXMrJg1L.jpg", "women", "S-XXL", "B0D8TGLHMB"],
  ["tops", "AUTOMET Women's Summer Oversized Short-Sleeve Top", "A relaxed short-sleeve top with a roomy cut that pairs easily with denim, skirts, and casual trousers.", 24500, "photo-1515372039744-b8f02a3ae446", "women", "S-XXL"],
  ["blouses", "Zeagoo Women's Long-Sleeve Cotton Gauze Button-Down Blouse", "A loose collared blouse with a button front and light cotton-gauze styling for work or weekends.", 39900, "photo-1485462537746-965f33f7f6a7", "women", "S-XXL"],
  ["blouses", "Minibee Women's Linen Retro Chinese Frog-Button Blouse", "A linen-look blouse with a stand collar and traditional frog-button detailing.", 42500, "photo-1496747611176-843222e1e57c", "women", "S-XXL"],
  ["crop-tops", "IDEALSANXUN Women's Linen Cropped Tank Top", "A sleeveless cropped tank with a clean neckline and linen-inspired texture for warm-weather styling.", 36500, "photo-1529139574466-a303027c1d8b", "women", "S-XL"],
  ["crop-tops", "CRZ YOGA Women's Butterluxe Cropped Tank Top", "A fitted cropped tank with a smooth stretch feel, suitable for layering, movement, or casual outfits.", 42000, "photo-1503341455253-b2e723bb3dbb", "women", "S-XL"],
  ["dresses", "Amazon Essentials Women's Fit & Flare Jersey Midi Dress", "A cotton jersey midi dress with a fitted bodice and a flared skirt for an easy day-to-evening look.", 48900, "https://m.media-amazon.com/images/I/31lCVTmZz1L._AC_.jpg", "women", "S-XXL", "B0CHVQNDBS"],
  ["dresses", "SAMPEEL Women's Long-Sleeve Smocked Midi Dress", "A long-sleeve dress with a smocked waist and flowing skirt, suited to casual outings and occasions.", 56900, "photo-1539008835657-9e8e9680c956", "women", "S-XXL", "B0BKQCRY2T"],
  ["skirts", "Amazon Essentials Women's Pull-On Knit Midi Skirt", "A comfortable pull-on midi skirt with a soft knit feel and a versatile everyday silhouette.", 32500, "photo-1496747611176-843222e1e57c", "women", "S-XXL"],
  ["skirts", "Urban CoCo Women's Stretchy A-Line Midi Skater Skirt", "A flared A-line skirt with stretch for comfortable movement and easy pairing with fitted tops.", 28900, "photo-1515372039744-b8f02a3ae446", "women", "S-XXL"],
  ["pants", "Amazon Essentials Men's Slim-Fit Stretch Golf Pant", "Lightweight stretch golf trousers with a tapered profile and practical front and back pockets.", 42900, "https://m.media-amazon.com/images/I/71XIHobfRpL._AC_SL1500_.jpg", "men", "S-XXL", "B07K4FX4WZ"],
  ["pants", "Amazon Essentials Women's Linen-Blend Wide-Leg Pant", "Relaxed wide-leg trousers with a drawstring waist and linen-blend feel for warm days.", 36500, "photo-1473966968600-fa801b869a1a", "women", "S-XXL"],
  ["jeans", "Levi's Women's 501 Original Jeans", "A straight-leg denim classic with a button fly and timeless five-pocket construction.", 79500, "photo-1541099649105-f69ad21f3246", "women", "S-XXL"],
  ["jeans", "Wrangler Authentics Men's Classic 5-Pocket Relaxed Fit Flex Jean", "Relaxed-fit five-pocket denim with a little stretch for comfortable daily wear.", 56500, "photo-1473966968600-fa801b869a1a", "men", "S-XXL"],
  ["shorts", "Wrangler Authentics Men's Classic Cargo Stretch Short", "A casual cargo short with utility pockets and a stretch blend for everyday movement.", 38900, "photo-1503342217505-b0a15ec3261c", "men", "S-XXL"],
  ["shorts", "Amazon Essentials Women's Mid-Rise Slim-Fit Shorts", "A mid-rise short with a clean slim fit and simple styling for warm-weather outfits.", 29500, "photo-1529139574466-a303027c1d8b", "women", "S-XXL"],
  ["sets", "YOUNGER TREE Toddler Girls Watermelon T-Shirt and Linen-Style Shorts Set", "A two-piece toddler outfit with a printed tee and coordinating shorts for sunny-day play.", 34900, "photo-1503454537195-1dcabb73ffb9", "girls", "S-L"],
  ["sets", "Amazon Essentials Women's Cotton Modal Pajama Set", "A coordinated long-sleeve pajama top and full-length bottoms in a soft cotton-modal blend.", 51500, "photo-1546015720-b8b30df5aa27", "women", "S-XXL", "B08XQXYPSH"],
  ["native-wear", "INMONARCH Men's Traditional Kurta Pajama Set", "A traditional South Asian tunic-and-trouser set with a straight cut and long sleeves.", 67500, "photo-1539008835657-9e8e9680c956", "men", "S-XXL"],
  ["native-wear", "Men's Cotton Kaftan Tunic and Trouser Set", "A relaxed traditional kaftan-inspired set with a long tunic and matching trousers for celebrations.", 72500, "photo-1489987707025-afc232f7ea0f", "men", "S-XXL"],
  ["outerwear", "Amazon Essentials Men's Packable Water-Resistant Puffer Jacket", "A lightweight insulated jacket with a full zip and packable design for cool or rainy days.", 87500, "photo-1551488831-00ddcb6c6bd3", "men", "S-XXL"],
  ["outerwear", "Columbia Women's Benton Springs Full-Zip Fleece Jacket", "A full-zip fleece layer with a soft hand feel and practical pockets for cool-weather wear.", 99500, "photo-1539533018447-63fcce2678e3", "women", "S-XXL"],
  ["sneakers", "adidas Men's Run Falcon 3.0 Running Shoes", "A breathable lace-up running shoe with cushioned Cloudfoam-style comfort for training and daily wear.", 79500, "https://m.media-amazon.com/images/I/818WwxPft8L._AC_SL1500_.jpg", "men", "US 7-13", "B0DF854GY5"],
  ["sneakers", "New Balance Men's 574 Core Sneaker", "A versatile everyday sneaker with a cushioned midsole and classic suede-and-mesh styling.", 139000, "photo-1460353581641-37baddab0fa2", "men", "US 7-13"],
  ["sandals", "Amazon Essentials Women's Two-Strap Heeled Sandal", "A two-strap sandal with an adjustable buckle and a low heel for dressy or casual outfits.", 46500, "photo-1603487742131-4160ec999306", "women", "US 5-12", "B08LPV1DTQ"],
  ["sandals", "Birkenstock Arizona Soft Footbed Sandal", "A two-strap sandal with adjustable buckles and a contoured footbed for everyday comfort.", 149000, "photo-1603808033192-082d6919d3e1", "unisex", "US 4-13"],
  ["heels", "DREAM PAIRS Women's Chunky Low Block-Heel Pump", "A rounded-toe pump with a stable block heel and a versatile profile for work or events.", 67500, "photo-1543163521-1bf539c55dd2", "women", "US 5-12"],
  ["heels", "Amazon Essentials Women's Pointed-Toe Ankle-Strap Heel", "A pointed-toe heel with an ankle strap and clean lines for occasion and evening styling.", 62500, "photo-1491553895911-0055eca6402d", "women", "US 5-12"],
  ["boots", "Amazon Essentials Women's Lace-Up Combat Boot", "An ankle-height lace-up boot with a side zip, padded footbed, and lug-style sole.", 69500, "photo-1608256246200-53e635b5b65f", "women", "US 5-15", "B096NP5X9Z"],
  ["boots", "Timberland Men's 6-Inch Premium Waterproof Boot", "A waterproof leather lace-up boot with a padded collar and rugged lug outsole.", 289000, "photo-1520639888713-7851133b1ed0", "men", "US 7-15"],
  ["loafers", "Clarks Men's Tilden Walk Oxford Shoe", "A polished leather-look lace-up with a cushioned footbed for office and formal wear.", 119000, "photo-1533867617858-e7b97e060509", "men", "US 7-13"],
  ["loafers", "Amazon Essentials Women's Loafer", "A slip-on loafer with a low profile and cushioned insole for work and everyday styling.", 59500, "photo-1543163521-1bf539c55dd2", "women", "US 5-12"],
  ["mens-shoes", "Skechers Men's Summits High Range Slip-In Sneaker", "A lightweight slip-on sneaker with a cushioned insole and flexible outsole for daily errands.", 109000, "photo-1608231387042-66d1773070a5", "men", "US 7-14"],
  ["mens-shoes", "Clarks Men's Tilden Cap Oxford", "A cap-toe lace-up dress shoe with a clean profile for work, weddings, and formal occasions.", 129000, "photo-1533867617858-e7b97e060509", "men", "US 7-13"],
  ["womens-shoes", "Amazon Essentials Women's Ballet Flat", "A simple round-toe ballet flat with a flexible sole for everyday outfits.", 42500, "photo-1491553895911-0055eca6402d", "women", "US 5-12"],
  ["womens-shoes", "Crocs Women's Kadee II Flip Flop", "A lightweight casual flip-flop with a simple strap profile for warm-weather wear.", 39000, "photo-1603487742131-4160ec999306", "women", "US 4-11"],
  ["kids-shoes", "Crocs Kids' Classic Clog", "A lightweight clog with a pivoting heel strap and ventilated upper for everyday use.", 53500, "photo-1514989940723-e8e51635b782", "girls", "US toddler 4–10; kids 10–6"],
  ["kids-shoes", "adidas Kids' Lite Racer Adapt 7.0 Running Shoe", "A lightweight slip-on style sneaker with a breathable upper for school and play.", 69500, "photo-1608231387042-66d1773070a5", "boys", "US toddler 4–10; kids 10–6"],
  ["handbags", "Michael Kors Jet Set Travel Large Crossbody Bag", "A compact structured crossbody with an adjustable strap and organized interior pockets.", 249000, "photo-1548036328-c9fa89d128fa", "women", "One size"],
  ["handbags", "Wrangler Women's Hobo Shoulder Bag", "A roomy shoulder bag with a relaxed shape and space for daily essentials.", 89500, "photo-1594223274512-ad4803739b7c", "women", "One size"],
  ["totes", "L.L.Bean Boat and Tote, Open-Top", "A sturdy canvas carryall with reinforced handles and a roomy open-top interior.", 98500, "photo-1584917865442-de89df76afd3", "unisex", "One size; multiple bag sizes on listing"],
  ["totes", "BAGGU Duck Bag", "A reusable canvas tote with shoulder straps and a practical shape for daily carry.", 74500, "photo-1548036328-c9fa89d128fa", "unisex", "One size"],
  ["backpacks", "JanSport SuperBreak One Backpack", "A lightweight daypack with a roomy main compartment and front utility pocket.", 69500, "photo-1553062407-98eeb64c6a62", "unisex", "One size"],
  ["backpacks", "Amazon Basics Laptop Backpack", "A multi-compartment backpack with a padded laptop section for commuting and school.", 62500, "photo-1553062407-98eeb64c6a62", "unisex", "One size"],
  ["clutches", "Dasein Women's Evening Clutch Bag", "A compact evening bag with a polished finish and space for a phone, cards, and small essentials.", 53500, "photo-1594223274512-ad4803739b7c", "women", "One size"],
  ["clutches", "JW PEI Women's Envelope Clutch Bag", "A structured envelope-style clutch with a clean profile for dinners and special occasions.", 99500, "photo-1548036328-c9fa89d128fa", "women", "One size"],
  ["crossbody-bags", "Baggallini Everywhere Bag", "A lightweight crossbody with an adjustable strap and multiple zip compartments for travel.", 119000, "photo-1584917865442-de89df76afd3", "women", "One size"],
  ["crossbody-bags", "Travelon Anti-Theft Classic Mini Shoulder Bag", "A compact travel crossbody with locking compartments and an adjustable strap.", 109000, "photo-1584917865442-de89df76afd3", "unisex", "One size"],
  ["jewelry", "PAVOI 14K Gold-Plated Huggie Earrings", "A pair of small gold-tone huggie hoops with a polished finish and hinged closure.", 18500, "photo-1535632066927-ab7c9ab60908", "women", "One size"],
  ["jewelry", "Swarovski Attract Trilogy Ring", "A polished crystal trilogy ring with a delicate profile for everyday or occasion wear.", 119000, "photo-1515562141207-7a88fb7ce338", "women", "Multiple ring sizes on listing"],
  ["watches", "Casio F-91W-1 Classic Digital Watch", "A lightweight digital watch with an alarm, stopwatch, backlight, and resin strap.", 29500, "photo-1523275335684-37898b6baf30", "unisex", "Adjustable strap"],
  ["watches", "Timex Weekender 38mm Watch", "A casual analog watch with a simple dial and interchangeable-style fabric strap.", 69500, "photo-1524592094714-0f0654e20314", "unisex", "Adjustable strap"],
  ["belts", "Dickies Men's 1-1/2-Inch Work Belt", "A durable everyday belt with a sturdy buckle for denim, work trousers, and casual outfits.", 26500, "photo-1624222247344-550fb8c8f157", "men", "S-XXL"],
  ["belts", "Levi's Men's Reversible Belt", "A reversible belt with two finish options and an adjustable fit for everyday wear.", 39500, "photo-1624222247344-550fb8c8f157", "men", "S-XXL"],
  ["scarves", "Amazon Essentials Women's Lightweight Woven Scarf", "A lightweight woven scarf that can be styled over everyday outfits or used as a travel layer.", 24500, "photo-1485968579580-b6d095142e6e", "women", "One size"],
  ["scarves", "JML Women's Pashmina Shawl Wrap", "A soft-feel shawl wrap with generous drape for layering over evening or occasion outfits.", 32500, "photo-1485462537746-965f33f7f6a7", "women", "One size"],
  ["sunglasses", "Ray-Ban New Wayfarer Classic Sunglasses", "A classic full-rim sunglasses frame with molded temples and UV-protective lenses.", 249000, "photo-1511499767150-a48a237f0083", "unisex", "Multiple frame sizes on listing"],
  ["sunglasses", "SOJOS SJ2067 Retro Polarized Sunglasses", "A retro-inspired frame with polarized lenses for bright-day casual wear.", 29500, "photo-1511499767150-a48a237f0083", "unisex", "One size"],
  ["mirrorless-cameras", "Sony Alpha a6400 Mirrorless Camera", "An interchangeable-lens APS-C camera with an electronic viewfinder and fast hybrid autofocus.", 1899000, "photo-1516035069371-29a1b244cc32", "unisex", "Camera body; lens kit options vary"],
  ["mirrorless-cameras", "Canon EOS R50 Mirrorless Camera", "A compact interchangeable-lens camera with an APS-C sensor and a vari-angle touchscreen.", 2199000, "photo-1502920917128-1aa500764cbd", "unisex", "Camera body; lens kit options vary"],
  ["dslr-cameras", "Canon EOS Rebel T7 DSLR Camera", "An entry-level DSLR kit with an optical viewfinder and interchangeable lens mount.", 1199000, "photo-1502920917128-1aa500764cbd", "unisex", "Camera kit options vary"],
  ["dslr-cameras", "Nikon D7500 DSLR Camera", "A DX-format DSLR body with an optical viewfinder, tilting display, and interchangeable lenses.", 2799000, "photo-1581591524425-c7e0978865fc", "unisex", "Camera body; lens kit options vary"],
  ["compact-cameras", "Sony RX100 VII Premium Compact Camera", "A pocketable premium compact camera with a built-in zoom lens and electronic viewfinder.", 2599000, "photo-1516035069371-29a1b244cc32", "unisex", "Fixed lens; no interchangeable lens sizes"],
  ["compact-cameras", "Canon PowerShot G7 X Mark III Digital Camera", "A compact camera with a built-in zoom lens, flip-up screen, and pocket-friendly body.", 1999000, "photo-1502920917128-1aa500764cbd", "unisex", "Fixed lens; no interchangeable lens sizes"],
  ["camera-lenses", "Canon EF 50mm f/1.8 STM Lens", "A lightweight prime lens with a bright f/1.8 aperture for portraits and low-light photography.", 425000, "photo-1542038784456-1ea8e935640e", "unisex", "50 mm focal length"],
  ["camera-lenses", "Sigma 18-50mm f/2.8 DC DN Contemporary Lens for Sony E", "A compact standard zoom lens with a constant f/2.8 aperture for APS-C mirrorless cameras.", 995000, "photo-1581591524425-c7e0978865fc", "unisex", "18–50 mm focal length"],
  ["camera-accessories", "SanDisk 128GB Extreme PRO SDXC UHS-I Card", "A high-speed SDXC memory card for compatible cameras, with ample capacity for photos and video.", 59500, "photo-1542038784456-1ea8e935640e", "unisex", "128 GB capacity"],
  ["camera-accessories", "Peak Design Slide Camera Strap", "An adjustable camera strap with quick-connection anchors for carrying compatible cameras.", 159000, "photo-1516035069371-29a1b244cc32", "unisex", "Adjustable strap"],
];

const familyByType = {
  shirts: ["fashion", "clothing"], "t-shirts": ["fashion", "clothing"], polos: ["fashion", "clothing"], tops: ["fashion", "clothing"],
  blouses: ["fashion", "clothing"], "crop-tops": ["fashion", "clothing"], dresses: ["fashion", "clothing"], skirts: ["fashion", "clothing"],
  pants: ["fashion", "clothing"], jeans: ["fashion", "clothing"], shorts: ["fashion", "clothing"], sets: ["fashion", "clothing"],
  "native-wear": ["fashion", "clothing"], outerwear: ["fashion", "clothing"], sneakers: ["fashion", "footwear"], sandals: ["fashion", "footwear"],
  heels: ["fashion", "footwear"], boots: ["fashion", "footwear"], loafers: ["fashion", "footwear"], "mens-shoes": ["fashion", "footwear"],
  "womens-shoes": ["fashion", "footwear"], "kids-shoes": ["fashion", "footwear"], handbags: ["fashion", "bags"], totes: ["fashion", "bags"],
  backpacks: ["fashion", "bags"], clutches: ["fashion", "bags"], "crossbody-bags": ["fashion", "bags"], jewelry: ["fashion", "accessories"],
  watches: ["fashion", "accessories"], belts: ["fashion", "accessories"], scarves: ["fashion", "accessories"], sunglasses: ["fashion", "accessories"],
  "mirrorless-cameras": ["electronics", "cameras-and-photography"], "dslr-cameras": ["electronics", "cameras-and-photography"],
  "compact-cameras": ["electronics", "cameras-and-photography"], "camera-lenses": ["electronics", "cameras-and-photography"],
  "camera-accessories": ["electronics", "cameras-and-photography"]
};

const knownAsinByName = {
  "Amazon Essentials Men's Slim-Fit Short-Sleeve Crewneck Pocket T-Shirt, Pack of 2": "B0CD86ZVRS",
  "Amazon Essentials Women's Classic-Fit Short-Sleeve V-Neck T-Shirt": "B0D8TGLHMB",
  "Amazon Essentials Women's Fit & Flare Jersey Midi Dress": "B0CHVQNDBS",
  "Amazon Essentials Men's Slim-Fit Stretch Golf Pant": "B07K4FX4WZ",
  "adidas Men's Run Falcon 3.0 Running Shoes": "B0DF854GY5",
  "Amazon Essentials Women's Two-Strap Heeled Sandal": "B08LPV1DTQ",
  "Amazon Essentials Women's Lace-Up Combat Boot": "B096NP5X9Z",
  "Amazon Essentials Women's Cotton Modal Pajama Set": "B08XQXYPSH"
};

const familyImages = {
  clothing: clothingPhotos,
  footwear: shoePhotos,
  bags: bagPhotos,
  accessories: accessoryPhotos,
  "cameras-and-photography": cameraPhotos
};
const apparelTypes = new Set(["shirts", "t-shirts", "polos", "tops", "blouses", "crop-tops", "dresses", "skirts", "pants", "jeans", "shorts", "sets", "native-wear", "outerwear"]);
// Curated homepage placements for the project preview. These are merchandising
// examples, not claims about real sales, current arrivals, or supplier stock.
const featuredKeys = new Set(["shirts:1", "polos:1", "dresses:1", "pants:1", "sneakers:1", "boots:2", "handbags:1", "jewelry:1", "mirrorless-cameras:1", "womens-shoes:1"]);
const newArrivalKeys = new Set(["t-shirts:1", "tops:2", "crop-tops:1", "skirts:1", "sets:1", "native-wear:1", "native-wear:2", "outerwear:1", "outerwear:2", "blouses:1"]);
const bestSellerKeys = new Set(["t-shirts:2", "jeans:1", "jeans:2", "sandals:1", "sandals:2", "backpacks:1", "watches:1", "camera-accessories:1", "camera-accessories:2", "shorts:1"]);
const dealKeys = new Set(["blouses:2", "shorts:2", "loafers:1", "loafers:2", "totes:1", "totes:2", "camera-lenses:1", "camera-lenses:2", "heels:1", "clutches:1"]);
const docs = [];
const countsByType = new Map();

for (const [typeId, name, copy, price, photo, audience, sizing] of products) {
  const count = (countsByType.get(typeId) || 0) + 1;
  countsByType.set(typeId, count);
  const merchandisingKey = `${typeId}:${count}`;
  const [departmentId, familyId] = familyByType[typeId] || [];
  if (!departmentId || !familyId || count > 2) throw new Error(`Invalid or duplicate taxonomy entry: ${typeId}`);
  const fallbackPhotos = familyImages[familyId];
  const imageUrl = photo.startsWith("https://")
    ? photo
    : `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=85`;
  const asin = knownAsinByName[name];
  const sourceUrl = asin ? `https://www.amazon.com/dp/${asin}` : `https://www.amazon.com/s?k=${encodeURIComponent(name)}`;
  const audiences = audience === "men" ? ["men"]
    : audience === "women" ? ["women"]
      : audience === "boys" ? ["boys"]
        : audience === "girls" ? ["girls"]
          : ["unisex"];
  const attributes = [
    { name: "Source", values: ["Amazon.com product listing reference"] },
    { name: "Project status", values: ["Demo catalog; not live seller inventory"] },
    ...(sizing ? [{ name: apparelTypes.has(typeId) ? "Available apparel sizes" : "Sizing / variant", values: [sizing] }] : [])
  ];
  const sizingNote = sizing ? ` Sizing noted on the Amazon reference: ${sizing}; variant availability can change.` : "";
  docs.push({
    seedKey: `amazon-project-catalog-v1:${typeId}:${count}`,
    name,
    description: `Project demo item. Sample price and stock only; no supplier or live inventory is connected. ${copy}${sizingNote}`,
    category: familyId,
    subcategory: typeId,
    taxonomy: { version: 1, departmentId, familyId, productTypeId: typeId, audienceIds: audiences, attributes },
    price,
    ...(dealKeys.has(merchandisingKey) ? { salePrice: Math.round(price * 0.85) } : {}),
    imageUrl,
    imageUrls: [imageUrl],
    sizes: apparelTypes.has(typeId) ? (typeId === "sets" ? ["S", "M", "L"] : ["S", "M", "L", "XL", "XXL"]) : [],
    stock: 8,
    featured: featuredKeys.has(merchandisingKey),
    badges: [
      ...(newArrivalKeys.has(merchandisingKey) ? ["new"] : []),
      ...(bestSellerKeys.has(merchandisingKey) ? ["best-seller"] : [])
    ],
    ratingAverage: 0,
    reviewCount: 0,
    isProjectDemo: true,
    catalogSource: "amazon.com",
    sourceUrl,
    sourceAsin: asin,
    demoPriceCurrency: "NGN",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  if (!fallbackPhotos?.length) throw new Error(`No image group configured for ${typeId}`);
}

for (const [typeId, count] of countsByType) {
  if (count !== 2) throw new Error(`Expected two products for ${typeId}, got ${count}`);
}
if (countsByType.size !== 37 || docs.length !== 74) {
  throw new Error(`Catalog completeness check failed: ${countsByType.size} types, ${docs.length} products`);
}
if ([featuredKeys, newArrivalKeys, bestSellerKeys, dealKeys].some((keys) => keys.size !== 10)) {
  throw new Error("Each homepage section should receive exactly ten curated demo products.");
}
const plannedSectionCounts = {
  featured: docs.filter((doc) => doc.featured).length,
  newArrivals: docs.filter((doc) => doc.badges.includes("new")).length,
  bestSellers: docs.filter((doc) => doc.badges.includes("best-seller")).length,
  discounted: docs.filter((doc) => doc.salePrice !== undefined).length
};
if (Object.values(plannedSectionCounts).some((count) => count !== 10)) {
  throw new Error("Homepage section selectors do not match ten catalog products each.");
}

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ebikas_place";
if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", products: docs.length, productTypes: countsByType.size, homepageSectionCounts: plannedSectionCounts, databaseConfigured: Boolean(uri) }, null, 2));
  process.exit(0);
}
if (!uri) throw new Error("MONGODB_URI is required (load it from .env.local).");

const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
  connectTimeoutMS: 10_000,
  serverSelectionTimeoutMS: 10_000
});

try {
  await client.connect();
  const collection = client.db(dbName).collection("products");
  const operations = docs.map((doc) => {
    const digest = createHash("sha256").update(doc.seedKey).digest("hex").slice(0, 24);
    const { seedKey, createdAt, ...fields } = doc;
    const now = new Date();
    return {
      updateOne: {
        filter: { seedKey },
        update: {
          $set: { ...fields, updatedAt: now },
          $setOnInsert: { _id: new ObjectId(digest), seedKey, createdAt: createdAt || now }
        },
        upsert: true
      }
    };
  });
  const writeResult = await collection.bulkWrite(operations, { ordered: false });
  const seededCount = await collection.countDocuments({ isProjectDemo: true, catalogSource: "amazon.com" });
  const existingCount = await collection.countDocuments({ isProjectDemo: { $ne: true } });
  const coverage = await collection.aggregate([
    { $match: { isProjectDemo: true, catalogSource: "amazon.com", seedKey: { $regex: "^amazon-project-catalog-v1:" } } },
    { $group: { _id: "$taxonomy.productTypeId", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  if (coverage.length !== 37 || coverage.some(({ count }) => count !== 2)) {
    throw new Error("Post-import taxonomy coverage verification failed.");
  }
  const sectionCounts = {
    featured: await collection.countDocuments({ isProjectDemo: true, seedKey: { $regex: "^amazon-project-catalog-v1:" }, featured: true }),
    newArrivals: await collection.countDocuments({ isProjectDemo: true, seedKey: { $regex: "^amazon-project-catalog-v1:" }, badges: "new" }),
    bestSellers: await collection.countDocuments({ isProjectDemo: true, seedKey: { $regex: "^amazon-project-catalog-v1:" }, badges: "best-seller" }),
    discounted: await collection.countDocuments({ isProjectDemo: true, seedKey: { $regex: "^amazon-project-catalog-v1:" }, salePrice: { $gt: 0 } })
  };
  if (Object.values(sectionCounts).some((count) => count !== 10)) {
    throw new Error("Post-import homepage section verification failed.");
  }
  console.log(JSON.stringify({
    mode: "applied",
    database: dbName,
    productTypes: countsByType.size,
    productsAdded: writeResult.upsertedCount,
    existingSeedRecordsRefreshed: writeResult.modifiedCount,
    projectDemoProductsInDatabase: seededCount,
    verifiedProductTypesWithTwoItems: coverage.length,
    homepageSectionCounts: sectionCounts,
    preexistingNonDemoProductsPreserved: existingCount
  }, null, 2));
} finally {
  await client.close();
}
