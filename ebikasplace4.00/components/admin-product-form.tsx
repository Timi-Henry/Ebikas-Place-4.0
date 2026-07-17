"use client";

import { ArrowLeft, ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AdminClassificationSection } from "@/components/admin-classification-section";
import { AdminToast, type AdminToastData, buildCloudinaryCleanupToast, retryCloudinaryCleanup } from "@/components/admin-toast";
import { getDiscountPercent } from "@/lib/pricing";
import { defaultCatalogTaxonomy, hydrateProductTaxonomy } from "@/lib/product-taxonomy";
import type { CatalogTaxonomy, Product, ProductBadge, ProductSize, ProductTaxonomyAttribute } from "@/lib/types";

type Status = "idle" | "saving" | "done" | "error";
type ImageRecord = { url: string; publicId?: string; choice: string };
type SelectedImage = { id: string; file: File };
const maxProductImages = 8;
const sizeOptions: Array<ProductSize | "NONE"> = ["NONE", "S", "M", "L", "XL", "XXL"];
const badgeOptions: Array<{ value: ProductBadge; label: string; help: string }> = [
  { value: "best-seller", label: "Best seller", help: "Marks this item as a customer favorite." }
];

function moveSelectedImageFirst(images: ImageRecord[], choice: string) {
  const selectedIndex = images.findIndex((image) => image.choice === choice);
  if (selectedIndex <= 0) return images;
  const nextImages = [...images];
  const [selectedImage] = nextImages.splice(selectedIndex, 1);
  return [selectedImage, ...nextImages];
}

export function AdminProductForm({
  product,
  catalog = defaultCatalogTaxonomy,
  mode = "create"
}: {
  product?: Product;
  catalog?: CatalogTaxonomy;
  mode?: "create" | "update";
}) {
  const currentImageUrls = product ? product.imageUrls?.length ? product.imageUrls : [product.imageUrl] : [];
  const currentImagePublicIds = product?.imagePublicIds?.length ? product.imagePublicIds : product?.imagePublicId ? [product.imagePublicId] : [];
  const initialTaxonomy = product
    ? hydrateProductTaxonomy(product)
    : {
        version: 1 as const,
        departmentId: "fashion",
        familyId: "clothing",
        productTypeId: "shirts",
        audienceIds: ["women"],
        attributes: []
      };
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [catalogState, setCatalogState] = useState(catalog);
  const [taxonomy, setTaxonomy] = useState(initialTaxonomy);
  const [featured, setFeatured] = useState(Boolean(product?.featured));
  const [bestSeller, setBestSeller] = useState(Boolean(product?.badges?.includes("best-seller")));
  const [selectedSizes, setSelectedSizes] = useState<ProductSize[]>(product?.sizes || []);
  const [normalPrice, setNormalPrice] = useState(product?.price ? String(product.price) : "");
  const [discountedPrice, setDiscountedPrice] = useState(product?.salePrice ? String(product.salePrice) : "");
  const [existingImages, setExistingImages] = useState<ImageRecord[]>(() => currentImageUrls.map((url, index) => ({
    url,
    publicId: currentImagePublicIds[index],
    choice: `existing-${index}`
  })));
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [pastedImageUrl, setPastedImageUrl] = useState("");
  const [mainImageChoice, setMainImageChoice] = useState(currentImageUrls.length ? "existing-0" : "file-0");
  const [imageNotice, setImageNotice] = useState("");
  const [toast, setToast] = useState<AdminToastData | null>(null);
  const [retryingCleanup, setRetryingCleanup] = useState(false);

  const numericNormalPrice = Number(normalPrice);
  const numericDiscountedPrice = discountedPrice ? Number(discountedPrice) : undefined;
  const discountPriceInvalid = numericDiscountedPrice !== undefined && Number.isFinite(numericDiscountedPrice) && numericDiscountedPrice >= numericNormalPrice;
  const discountPreview = getDiscountPercent({
    price: Number.isFinite(numericNormalPrice) ? numericNormalPrice : 0,
    salePrice: numericDiscountedPrice !== undefined && Number.isFinite(numericDiscountedPrice) ? numericDiscountedPrice : undefined
  });
  const imageCount = existingImages.length + selectedImages.length + (pastedImageUrl.trim() ? 1 : 0);

  function updateAttribute(index: number, attribute: ProductTaxonomyAttribute) {
    setTaxonomy((current) => ({
      ...current,
      attributes: current.attributes.map((item, itemIndex) => itemIndex === index ? attribute : item)
    }));
  }

  function addAttribute() {
    setTaxonomy((current) => ({ ...current, attributes: [...current.attributes, { name: "", values: [] }] }));
  }

  function removeAttribute(index: number) {
    setTaxonomy((current) => ({
      ...current,
      attributes: current.attributes.filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function toggleSize(size: ProductSize | "NONE") {
    if (size === "NONE") {
      setSelectedSizes([]);
      return;
    }

    setSelectedSizes((current) => (current.includes(size) ? current.filter((item) => item !== size) : [...current, size]));
  }

  function addSelectedImages(files: File[]) {
    const availableSlots = maxProductImages - existingImages.length - selectedImages.length - (pastedImageUrl.trim() ? 1 : 0);
    if (availableSlots <= 0) {
      setImageNotice(`A product can have up to ${maxProductImages} images.`);
      return;
    }

    const selectedKeys = new Set(selectedImages.map(({ file }) => `${file.name}-${file.size}-${file.lastModified}`));
    const additions = files
      .filter((file) => !selectedKeys.has(`${file.name}-${file.size}-${file.lastModified}`))
      .slice(0, availableSlots)
      .map((file, index) => ({ id: `file-${Date.now()}-${index}`, file }));

    if (!additions.length) {
      setImageNotice("Those images are already in the gallery.");
      return;
    }

    setSelectedImages((current) => [...current, ...additions]);
    if (!existingImages.length && !selectedImages.length && !pastedImageUrl.trim()) {
      setMainImageChoice(additions[0].id);
    }
    setImageNotice(files.length > additions.length ? `Added ${additions.length}. The gallery limit is ${maxProductImages} images.` : "");
  }

  function removeSelectedImage(id: string) {
    const fallback = existingImages[0]?.choice || selectedImages.find((image) => image.id !== id)?.id || (pastedImageUrl.trim() ? "url" : "file-0");
    setSelectedImages((current) => current.filter((image) => image.id !== id));
    setMainImageChoice((current) => current === id ? fallback : current);
    setImageNotice("");
  }

  function removeExistingImage(choice: string) {
    const fallback = existingImages.find((image) => image.choice !== choice)?.choice || selectedImages[0]?.id || (pastedImageUrl.trim() ? "url" : "file-0");
    setExistingImages((current) => current.filter((image) => image.choice !== choice));
    setMainImageChoice((current) => current === choice ? fallback : current);
    setImageNotice("");
  }

  async function retryCleanup(publicIds: string[], context = "Cloudinary retry") {
    setRetryingCleanup(true);
    try {
      const cleanup = await retryCloudinaryCleanup(publicIds);
      const cleanupToast = buildCloudinaryCleanupToast(cleanup, context);
      setToast(
        cleanupToast || {
          tone: "success",
          title: "Cloudinary cleanup finished",
          message: "The selected Cloudinary images were deleted or were already missing."
        }
      );
    } catch (error) {
      setToast({
        tone: "error",
        title: "Cloudinary retry failed",
        message: error instanceof Error ? error.message : "Cloudinary cleanup retry failed."
      });
    } finally {
      setRetryingCleanup(false);
    }
  }

  async function cleanupUploadedImagesAfterFailure(uploadedImages: Array<{ secureUrl: string; publicId: string }>) {
    const publicIds = uploadedImages.map((image) => image.publicId).filter(Boolean);
    if (publicIds.length === 0) return;

    await retryCleanup(publicIds, "Cleaning failed save uploads");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setStatus("saving");
    setMessage("");
    setToast(null);

    const form = new FormData(formElement);
    const submittedNormalPrice = Number(form.get("price"));
    const submittedDiscountedPrice = form.get("salePrice") ? Number(form.get("salePrice")) : undefined;
    if (submittedDiscountedPrice !== undefined && submittedDiscountedPrice >= submittedNormalPrice) {
      setStatus("error");
      setMessage("Discounted price must be lower than the normal price.");
      return;
    }
    if (!taxonomy.departmentId || !taxonomy.familyId || !taxonomy.productTypeId || taxonomy.audienceIds.length === 0) {
      setStatus("error");
      setMessage("Choose a department, category, product type, and at least one audience.");
      return;
    }
    if (imageCount === 0) {
      setStatus("error");
      setMessage("Add at least one product image.");
      return;
    }
    if (imageCount > maxProductImages) {
      setStatus("error");
      setMessage(`A product can have up to ${maxProductImages} images.`);
      return;
    }
    const uploadedImages: Array<{ secureUrl: string; publicId: string }> = [];

    for (const { file } of selectedImages) {
      const uploadForm = new FormData();
      uploadForm.set("image", file);
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadForm });
      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) {
        await cleanupUploadedImagesAfterFailure(uploadedImages);
        setStatus("error");
        setMessage(uploadData.error || "Image upload failed.");
        return;
      }
      uploadedImages.push(uploadData.image);
    }

    const pastedUrl = pastedImageUrl.trim();
    let imageRecords: ImageRecord[] = [...existingImages, ...uploadedImages.map((image, index) => ({
      url: image.secureUrl,
      publicId: image.publicId,
      choice: selectedImages[index].id
    }))];

    if (pastedUrl) {
      imageRecords.push({ url: pastedUrl, choice: "url" });
    }

    const orderedImages = moveSelectedImageFirst(imageRecords, mainImageChoice);
    const imageUrls = orderedImages.map((image) => image.url);
    const imagePublicIds = orderedImages.map((image) => image.publicId).filter((publicId): publicId is string => Boolean(publicId));
    const primaryPublicId = orderedImages[0]?.publicId;
    const selectedBadges = form.getAll("badges").map(String);
    const badges = mode === "create" ? [...new Set(["new", ...selectedBadges])] : selectedBadges;
    const cleanedTaxonomy = {
      ...taxonomy,
      attributes: taxonomy.attributes
        .map((attribute) => ({
          name: attribute.name.trim(),
          values: attribute.values.map((value) => value.trim()).filter(Boolean)
        }))
        .filter((attribute) => attribute.name && attribute.values.length)
    };

    const productResponse = await fetch(mode === "update" && product ? `/api/products/${product.id}` : "/api/products", {
      method: mode === "update" ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description"),
        category: taxonomy.familyId,
        subcategory: taxonomy.productTypeId,
        taxonomy: cleanedTaxonomy,
        price: form.get("price"),
        salePrice: form.get("salePrice") || undefined,
        stock: form.get("stock"),
        featured: form.get("featured") === "on",
        badges,
        imageUrl: imageUrls[0],
        imageUrls,
        imagePublicId: primaryPublicId,
        imagePublicIds,
        sizes: selectedSizes
      })
    });
    const productData = await productResponse.json();

    if (!productResponse.ok) {
      await cleanupUploadedImagesAfterFailure(uploadedImages);
      setStatus("error");
      setMessage(productData.error || "Product could not be saved.");
      return;
    }

    formElement.reset();
    if (mode === "create") {
      setSelectedSizes([]);
      setNormalPrice("");
      setDiscountedPrice("");
      setTaxonomy({
        version: 1,
        departmentId: "fashion",
        familyId: "clothing",
        productTypeId: "shirts",
        audienceIds: ["women"],
        attributes: []
      });
      setFeatured(false);
      setBestSeller(false);
      setSelectedImages([]);
      setPastedImageUrl("");
      setMainImageChoice("file-0");
      setImageNotice("");
    } else {
      setExistingImages(orderedImages.map((image, index) => ({ ...image, choice: `existing-${index}` })));
      setSelectedImages([]);
      setPastedImageUrl("");
      setMainImageChoice("existing-0");
      setImageNotice("");
    }
    setStatus("done");
    setMessage(mode === "update" ? "Product updated. Changes are now saved." : "Product saved. It will appear in the storefront after refresh.");
    setToast(
      buildCloudinaryCleanupToast(productData.cloudinaryCleanup, mode === "update" ? "Updating product images" : "Saving product") || {
        tone: "success",
        title: mode === "update" ? "Product updated" : "Product saved",
        message: mode === "update" ? "Product changes are saved and Cloudinary cleanup is complete." : "The product was saved successfully."
      }
    );
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <AdminToast
        toast={toast}
        retrying={retryingCleanup}
        onClose={() => setToast(null)}
        onRetry={toast?.retryPublicIds ? () => retryCleanup(toast.retryPublicIds || []) : undefined}
      />
      <label>
        Product name
        <input name="name" required minLength={2} maxLength={120} defaultValue={product?.name} />
      </label>
      <AdminClassificationSection
        catalog={catalogState}
        taxonomy={taxonomy}
        onCatalogChange={setCatalogState}
        onChange={setTaxonomy}
        saleActive={discountPreview > 0}
        featured={featured}
        bestSeller={bestSeller}
      />
      <label>
        Normal price
        <input name="price" required type="number" min="0.01" step="0.01" value={normalPrice} onChange={(event) => setNormalPrice(event.target.value)} />
      </label>
      <label>
        Discounted price
        <input
          name="salePrice"
          type="number"
          min="0.01"
          step="0.01"
          value={discountedPrice}
          onChange={(event) => setDiscountedPrice(event.target.value)}
          placeholder="Leave blank when not on sale"
          aria-describedby="discount-preview"
          aria-invalid={discountPriceInvalid}
        />
      </label>
      <div className={`admin-discount-preview ${discountPreview > 0 ? "active" : ""} ${discountPriceInvalid ? "invalid" : ""}`} id="discount-preview" aria-live="polite">
        <strong>{discountPriceInvalid ? "Invalid discount" : discountPreview > 0 ? `${discountPreview}% Off` : "No active discount"}</strong>
        <span>
          {discountPriceInvalid
            ? "Enter a discounted price lower than the normal price."
            : discountPreview > 0
              ? "This percentage will appear automatically on the product ribbon."
              : "Add a lower discounted price to activate the sale display."}
        </span>
      </div>
      <label>
        Stock
        <input name="stock" required type="number" min="0" step="1" defaultValue={product?.stock} />
      </label>
      <label className="wide">
        Description
        <textarea name="description" required minLength={10} maxLength={700} rows={4} defaultValue={product?.description} />
      </label>
      <fieldset className="admin-attribute-builder wide">
        <legend>Product details</legend>
        <p>Add searchable details that suit this product type, such as Material, Colour, Sleeve, Lens mount, or Connectivity.</p>
        <div className="admin-attribute-list">
          {taxonomy.attributes.map((attribute, index) => (
            <div className="admin-attribute-row" key={index}>
              <label>
                Detail name
                <input
                  value={attribute.name}
                  maxLength={60}
                  placeholder="e.g. Material"
                  onChange={(event) => updateAttribute(index, { ...attribute, name: event.target.value })}
                />
              </label>
              <label>
                Value
                <input
                  value={attribute.values.join(", ")}
                  maxLength={300}
                  placeholder="e.g. Cotton or Wi-Fi, Bluetooth"
                  onChange={(event) => updateAttribute(index, {
                    ...attribute,
                    values: event.target.value.split(",").map((value) => value.trim())
                  })}
                />
              </label>
              <button className="secondary-button danger-button" type="button" onClick={() => removeAttribute(index)} aria-label={`Remove ${attribute.name || "product detail"}`}>
                <Trash2 size={16} /> Remove
              </button>
            </div>
          ))}
        </div>
        <button className="secondary-button admin-add-detail" type="button" onClick={addAttribute}>
          <Plus size={16} /> Add product detail
        </button>
      </fieldset>
      {mode === "update" && existingImages.length ? (
        <div className="admin-current-images wide">
          <span>Current gallery - choose the main image or remove an image</span>
          <div>
            {existingImages.map((image) => (
              <div className="admin-current-image-card" key={image.choice}>
                <button
                  className={mainImageChoice === image.choice ? "active" : ""}
                  type="button"
                  onClick={() => setMainImageChoice(image.choice)}
                  aria-label={`Make this the main image${mainImageChoice === image.choice ? "; currently selected" : ""}`}
                >
                  <img src={image.url} alt="" />
                  <small>{mainImageChoice === image.choice ? "Main" : "Gallery"}</small>
                </button>
                <button className="admin-remove-gallery-image" type="button" onClick={() => removeExistingImage(image.choice)} aria-label="Remove this image">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <label className="wide admin-image-upload-control">
        {mode === "update" ? "Add more product images" : "Product images"}
        <small>Select one or several images. You can use this button again to add more, up to {maxProductImages} images total.</small>
        <input
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files || []);
            addSelectedImages(files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {selectedImages.length ? (
        <div className="admin-selected-images wide">
          <div><strong>Images ready to upload</strong><span>{selectedImages.length} selected</span></div>
          <div className="admin-selected-image-list">
            {selectedImages.map(({ id, file }, index) => (
              <article className={mainImageChoice === id ? "active" : ""} key={id}>
                <button type="button" onClick={() => setMainImageChoice(id)} aria-label={`Make ${file.name} the main image`}>
                  <Upload size={17} />
                  <span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB � Image {index + 1}</small></span>
                  <b>{mainImageChoice === id ? "Main" : "Gallery"}</b>
                </button>
                <button type="button" onClick={() => removeSelectedImage(id)} aria-label={`Remove ${file.name}`}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <label className="wide">
        Or add one image URL
        <input
          name="imageUrl"
          type="url"
          placeholder="https://..."
          value={pastedImageUrl}
          onChange={(event) => {
            const nextUrl = event.target.value;
            setPastedImageUrl(nextUrl);
            if (!selectedImages.length && !existingImages.length && nextUrl.trim()) {
              setMainImageChoice("url");
            } else if (!nextUrl.trim()) {
              setMainImageChoice((current) => current === "url" ? existingImages[0]?.choice || selectedImages[0]?.id || "file-0" : current);
            }
          }}
        />
      </label>
      {imageCount > 0 ? (
        <label className="wide admin-main-image-select">
          Main image
          <select value={mainImageChoice} onChange={(event) => setMainImageChoice(event.target.value)}>
            {existingImages.map((image, index) => <option value={image.choice} key={image.choice}>Current image {index + 1}</option>)}
            {selectedImages.map(({ id, file }, index) => (
              <option value={id} key={id}>
                New upload {index + 1}: {file.name}
              </option>
            ))}
            {pastedImageUrl.trim() ? <option value="url">Pasted image URL</option> : null}
          </select>
          <small>The first image customers see on product cards and product pages.</small>
        </label>
      ) : null}
      <p className={`admin-image-count wide ${imageCount >= maxProductImages ? "limit" : ""}`} role="status">
        {imageCount} of {maxProductImages} images added{imageNotice ? ` - ${imageNotice}` : ""}
      </p>
      <label className="form-toggle form-toggle-card admin-feature-toggle wide">
        <input name="featured" type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
        <span className="form-toggle-copy admin-feature-copy">
          <strong>Featured product</strong>
          <small>Show this item in the storefront featured carousel.</small>
        </span>
        <span className="form-toggle-switch admin-feature-switch" aria-hidden="true">
          <span />
        </span>
      </label>
      <fieldset className="admin-size-picker wide">
        <legend>Available sizes</legend>
        <div>
          {sizeOptions.map((size) => (
            <button
              className={(size === "NONE" && selectedSizes.length === 0) || selectedSizes.includes(size as ProductSize) ? "active" : ""}
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
            >
              {size === "NONE" ? "None" : size}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="admin-size-picker wide">
        <legend>Storefront badges</legend>
        <div>
          {mode === "create" ? (
            <div className="admin-automatic-badge">
              <span>New</span>
              <div>
                <strong>New arrival is automatic</strong>
                <small>This product will appear in New arrivals as soon as it is saved.</small>
              </div>
            </div>
          ) : (
            <label className="badge-checkbox">
              <input name="badges" type="checkbox" value="new" defaultChecked={product?.badges?.includes("new")} />
              <span>
                <strong>New arrival</strong>
                <small>Turn this off when the product should leave New arrivals.</small>
              </span>
            </label>
          )}
          {badgeOptions.map((badge) => (
            <label className="badge-checkbox" key={badge.value}>
              <input
                name="badges"
                type="checkbox"
                value={badge.value}
                checked={bestSeller}
                onChange={(event) => setBestSeller(event.target.checked)}
              />
              <span>
                <strong>{badge.label}</strong>
                <small>{badge.help}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="wide">
        <button className="primary-button" type="submit" disabled={status === "saving"}>
          <Upload size={17} />
          {status === "saving" ? "Saving..." : mode === "update" ? "Update product" : "Save product"}
        </button>
        {mode === "update" && product ? (
          <div className="admin-form-links">
            <Link href="/admin/products">
              <ArrowLeft size={16} />
              Back to inventory
            </Link>
            <Link href={`/products/${product.id}`}>
              <ExternalLink size={16} />
              View product
            </Link>
          </div>
        ) : (
          <div className="admin-form-links">
            <Link href="/admin/products">
              <ExternalLink size={16} />
              Manage inventory
            </Link>
          </div>
        )}
        {message ? <p className="notice">{message}</p> : null}
      </div>
    </form>
  );
}
