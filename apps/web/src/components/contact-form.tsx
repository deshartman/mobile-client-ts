"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Monitor, MessageSquare, Phone, Server, User } from "lucide-react";
import type { Contact, ContactIdentity, IdentityType } from "@mobileclient/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, contactsApi } from "@/lib/client/api-client";
import { fileToAvatarDataUrl } from "@/lib/client/image";
import { useSession } from "@/hooks/use-session";

const IDENTITY_LABEL: Record<IdentityType, string> = {
  Phone: "Phone",
  Message: "SMS",
  WhatsApp: "WhatsApp",
  SIP: "SIP",
  Client: "Client",
};

const IDENTITY_ROWS: IdentityType[] = ["Phone", "Message", "WhatsApp", "SIP", "Client"];

function IdentityIcon({ type }: Readonly<{ type: IdentityType }>) {
  const cls = "h-4 w-4 text-primary";
  switch (type) {
    case "Phone":
      return <Phone className={cls} aria-hidden />;
    case "Message":
      return <MessageSquare className={cls} aria-hidden />;
    case "WhatsApp":
      return <MessageSquare className={cls} aria-hidden />;
    case "SIP":
      return <Server className={cls} aria-hidden />;
    case "Client":
      return <Monitor className={cls} aria-hidden />;
  }
}

function findIdentityValue(identities: readonly ContactIdentity[], type: IdentityType): string {
  return identities.find((i) => i.type === type)?.value ?? "";
}

interface Props {
  initial?: Contact;
}

/**
 * Auto-saving contact form. Mirrors aussie's fixed-slot layout:
 * one row per identity type (Phone/SMS/WhatsApp/SIP/Client). Phone
 * carries an "Also SMS" checkbox that mirrors the Phone value into
 * the SMS slot — so the common case (one number for both) stays a
 * single field, while a distinct SMS number is one click away.
 *
 * Save semantics: on blur of any text field, if the form has been
 * touched since the last save, PUT the full contact. Toast on
 * failure. New contacts: first non-empty Phone POSTs and routes to
 * /contact/<guid>.
 */
export function ContactForm({ initial }: Readonly<Props>) {
  const router = useRouter();
  const { session } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [photoData, setPhotoData] = useState<string | undefined>(initial?.photoData);
  const [phone, setPhone] = useState(findIdentityValue(initial?.identities ?? [], "Phone"));
  const [sms, setSms] = useState(findIdentityValue(initial?.identities ?? [], "Message"));
  const [whatsapp, setWhatsapp] = useState(
    findIdentityValue(initial?.identities ?? [], "WhatsApp"),
  );
  const [sip, setSip] = useState(findIdentityValue(initial?.identities ?? [], "SIP"));
  const [client, setClient] = useState(findIdentityValue(initial?.identities ?? [], "Client"));

  // "Also SMS": ticked when SMS is empty or already mirrors Phone — the common
  // case. Untick to enter a distinct SMS number.
  const initialSms = findIdentityValue(initial?.identities ?? [], "Message");
  const initialPhone = findIdentityValue(initial?.identities ?? [], "Phone");
  const [alsoSms, setAlsoSms] = useState(!initialSms || initialSms === initialPhone);

  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef<string>("");

  // Mirror Phone → SMS while alsoSms is on.
  useEffect(() => {
    if (alsoSms) setSms(phone);
  }, [alsoSms, phone]);

  if (!session) return null;

  function buildPayload() {
    const identities: ContactIdentity[] = [];
    const smsValue = alsoSms ? phone : sms;
    const rows: Array<[IdentityType, string]> = [
      ["Phone", phone],
      ["Message", smsValue],
      ["WhatsApp", whatsapp],
      ["SIP", sip],
      ["Client", client],
    ];
    for (const [type, value] of rows) {
      const trimmed = value.trim();
      if (trimmed) identities.push({ type, value: trimmed });
    }
    return {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      company: company.trim() || undefined,
      photoData: photoData || undefined,
      identities,
    };
  }

  async function persist() {
    if (!session || saving) return;
    if (!dirtyRef.current) return;
    const payload = buildPayload();

    if (payload.identities.length === 0) {
      // New contact with nothing entered yet — silent no-op until user types.
      return;
    }

    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedRef.current) return;

    setSaving(true);
    try {
      if (initial) {
        await contactsApi.update(session.userGuid, initial.contactGuid, payload);
        lastSavedRef.current = snapshot;
        dirtyRef.current = false;
      } else {
        // First successful save: create then route to the edit URL so further
        // edits target the persisted record.
        if (!payload.identities.some((i) => i.type === "Phone")) {
          // Aussie required at least one phone. Surface only after the user
          // has actually tried to save something.
          toast.error("At least one phone number is required");
          return;
        }
        const created = await contactsApi.create(session.userGuid, payload);
        lastSavedRef.current = snapshot;
        dirtyRef.current = false;
        toast.success("Contact created");
        router.replace(`/contact/${created.contactGuid}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function markDirty() {
    dirtyRef.current = true;
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setPhotoData(dataUrl);
      markDirty();
      // Photo upload bypasses blur — save immediately.
      setTimeout(() => void persist(), 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load photo");
    }
  }

  async function handleDelete() {
    if (!session || !initial) return;
    if (!confirm(`Delete ${initial.firstName ?? "this contact"}?`)) return;
    try {
      await contactsApi.delete(session.userGuid, initial.contactGuid);
      toast.success("Contact deleted");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary"
          aria-label="Upload photo"
        >
          {photoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoData} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-12 w-12" aria-hidden />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName" className="text-xs text-muted-foreground">
            First Name
          </Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              markDirty();
            }}
            onBlur={() => void persist()}
            autoComplete="given-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lastName" className="text-xs text-muted-foreground">
            Last Name
          </Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              markDirty();
            }}
            onBlur={() => void persist()}
            autoComplete="family-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company" className="text-xs text-muted-foreground">
            Company Name
          </Label>
          <Input
            id="company"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              markDirty();
            }}
            onBlur={() => void persist()}
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h2 className="text-sm font-semibold">Contact Methods</h2>

        {IDENTITY_ROWS.map((type) => {
          if (type === "Phone") {
            return (
              <div key={type} className="space-y-1.5">
                <Label
                  htmlFor="identity-Phone"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <IdentityIcon type="Phone" />
                  Phone
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="identity-Phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      markDirty();
                    }}
                    onBlur={() => void persist()}
                    inputMode="tel"
                    placeholder="+61 4xx xxx xxx"
                    className="flex-1"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={alsoSms}
                      onChange={(e) => {
                        setAlsoSms(e.target.checked);
                        markDirty();
                        setTimeout(() => void persist(), 0);
                      }}
                      className="h-4 w-4"
                    />
                    SMS
                  </label>
                </div>
              </div>
            );
          }
          if (type === "Message") {
            return (
              <div key={type} className="space-y-1.5">
                <Label
                  htmlFor="identity-Message"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <IdentityIcon type="Message" />
                  SMS
                </Label>
                <Input
                  id="identity-Message"
                  value={alsoSms ? phone : sms}
                  onChange={(e) => {
                    setSms(e.target.value);
                    markDirty();
                  }}
                  onBlur={() => void persist()}
                  readOnly={alsoSms}
                  inputMode="tel"
                  className={alsoSms ? "bg-muted" : ""}
                />
              </div>
            );
          }
          const slots: Record<"WhatsApp" | "SIP" | "Client", [string, (v: string) => void]> = {
            WhatsApp: [whatsapp, setWhatsapp],
            SIP: [sip, setSip],
            Client: [client, setClient],
          };
          const [value, setter] = slots[type as "WhatsApp" | "SIP" | "Client"];
          return (
            <div key={type} className="space-y-1.5">
              <Label
                htmlFor={`identity-${type}`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <IdentityIcon type={type} />
                {IDENTITY_LABEL[type]}
              </Label>
              <Input
                id={`identity-${type}`}
                value={value}
                onChange={(e) => {
                  setter(e.target.value);
                  markDirty();
                }}
                onBlur={() => void persist()}
              />
            </div>
          );
        })}
      </div>

      {initial && (
        <div className="border-t pt-4">
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => void handleDelete()}
          >
            Delete contact
          </Button>
        </div>
      )}
    </div>
  );
}
