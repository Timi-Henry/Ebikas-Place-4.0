"use client";

import { Save, Tag } from "lucide-react";
import { useState } from "react";
import {
  HOMEPAGE_DEAL_LABEL_GROUPS,
  isHomepageDealLabelPreset
} from "@/lib/deal-labels";

export function AdminDealLabelManager({ initialLabel }: { initialLabel: string }) {
  const initialIsPreset = isHomepageDealLabelPreset(initialLabel);
  const [mode, setMode] = useState<"preset" | "custom">(initialIsPreset ? "preset" : "custom");
  const [selectedPreset, setSelectedPreset] = useState(initialIsPreset ? initialLabel : HOMEPAGE_DEAL_LABEL_GROUPS[0].options[0]);
  const [customLabel, setCustomLabel] = useState(initialIsPreset ? "" : initialLabel);
  const [savedLabel, setSavedLabel] = useState(initialLabel);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [message, setMessage] = useState("");
  const nextLabel = (mode === "custom" ? customLabel : selectedPreset).trim();
  const canSave = nextLabel.length >= 2 && nextLabel.length <= 50 && status !== "saving";

  async function saveLabel() {
    if (!canSave) {
      return;
    }

    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/admin/homepage-deals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "The homepage deal label could not be saved.");
        return;
      }

      setSavedLabel(data.label);
      setStatus("done");
      setMessage("Homepage deal label updated.");
    } catch {
      setStatus("error");
      setMessage("The homepage deal label could not be saved. Check your connection and try again.");
    }
  }

  return (
    <section className="admin-deal-label-manager" aria-labelledby="deal-label-title">
      <div className="admin-deal-label-heading">
        <span aria-hidden="true"><Tag size={18} /></span>
        <div>
          <span className="eyebrow">Homepage merchandising</span>
          <h2 id="deal-label-title">Deal section label</h2>
          <p>Choose an everyday or seasonal message. This updates the small label beside the homepage deals.</p>
        </div>
      </div>

      <div className="admin-deal-label-preview" aria-label="Current homepage deal label">
        <small>Currently live</small>
        <strong>{savedLabel}</strong>
      </div>

      <div className="admin-deal-label-groups">
        {HOMEPAGE_DEAL_LABEL_GROUPS.map((group) => (
          <fieldset key={group.name}>
            <legend>{group.name}</legend>
            <div>
              {group.options.map((option) => (
                <button
                  aria-pressed={mode === "preset" && selectedPreset === option}
                  className={mode === "preset" && selectedPreset === option ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode("preset");
                    setSelectedPreset(option);
                    setStatus("idle");
                    setMessage("");
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="admin-deal-custom-label">
        <span>
          <strong>Custom label</strong>
          <small>Use 2 to 50 characters.</small>
        </span>
        <input
          maxLength={50}
          minLength={2}
          placeholder="For example: Anniversary offers"
          value={customLabel}
          onChange={(event) => {
            setMode("custom");
            setCustomLabel(event.target.value);
            setStatus("idle");
            setMessage("");
          }}
          onFocus={() => setMode("custom")}
        />
      </label>

      <div className="admin-deal-label-actions">
        <button className="primary-button" type="button" disabled={!canSave} onClick={saveLabel}>
          <Save size={17} />
          {status === "saving" ? "Saving..." : "Save homepage label"}
        </button>
        {message ? (
          <p className={status === "error" ? "admin-deal-label-error" : ""} role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

