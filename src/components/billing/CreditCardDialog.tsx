import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import type { CreditCardInput } from "@/lib/asaasCheckout";

interface CreditCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (card: CreditCardInput) => void | Promise<void>;
  loading?: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
}

function formatCardNumber(value: string): string {
  return value
    .replace(/\D+/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D+/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatDocument(value: string): string {
  const d = value.replace(/\D+/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function formatPostalCode(value: string): string {
  const d = value.replace(/\D+/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Formulário de cartão de crédito/débito. Os dados são enviados diretamente
 * ao gateway (Asaas) pela edge function — nunca ficam salvos no aplicativo;
 * guardamos apenas bandeira e últimos 4 dígitos.
 */
export function CreditCardDialog({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
  title = "Cartão de crédito ou débito",
  description = "Os dados do cartão são criptografados e enviados diretamente ao gateway de pagamento (Asaas). Nenhum número de cartão fica salvo no aplicativo.",
  submitLabel = "Salvar cartão",
}: CreditCardDialogProps) {
  const [holderName, setHolderName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [ccv, setCcv] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [phone, setPhone] = useState("");

  const [expMonth, expYearRaw] = expiry.split("/");
  const expYear = expYearRaw ? (expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw) : "";

  const digitsOnly = (v: string) => v.replace(/\D+/g, "");
  const valid =
    holderName.trim().length >= 3 &&
    digitsOnly(number).length >= 13 &&
    /^\d{2}$/.test(expMonth ?? "") &&
    Number(expMonth) >= 1 && Number(expMonth) <= 12 &&
    expYear.length === 4 &&
    /^\d{3,4}$/.test(digitsOnly(ccv)) &&
    [11, 14].includes(digitsOnly(cpfCnpj).length) &&
    digitsOnly(postalCode).length === 8 &&
    addressNumber.trim().length > 0;

  const handleSubmit = async () => {
    if (!valid || loading) return;
    await onSubmit({
      holderName: holderName.trim(),
      number: digitsOnly(number),
      expiryMonth: expMonth,
      expiryYear: expYear,
      ccv: digitsOnly(ccv),
      cpfCnpj: digitsOnly(cpfCnpj),
      postalCode: digitsOnly(postalCode),
      addressNumber: addressNumber.trim(),
      phone: digitsOnly(phone) || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="cc-holder">Nome impresso no cartão</Label>
            <Input
              id="cc-holder"
              autoComplete="cc-name"
              placeholder="Como está escrito no cartão"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-number">Número do cartão</Label>
            <Input
              id="cc-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={number}
              onChange={(e) => setNumber(formatCardNumber(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-expiry">Validade</Label>
              <Input
                id="cc-expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-cvv">Código (CVV)</Label>
              <Input
                id="cc-cvv"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                maxLength={4}
                value={ccv}
                onChange={(e) => setCcv(e.target.value.replace(/\D+/g, "").slice(0, 4))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-doc">CPF ou CNPJ do titular</Label>
            <Input
              id="cc-doc"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(formatDocument(e.target.value))}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-zip">CEP</Label>
              <Input
                id="cc-zip"
                inputMode="numeric"
                placeholder="00000-000"
                value={postalCode}
                onChange={(e) => setPostalCode(formatPostalCode(e.target.value))}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-address-number">Número</Label>
              <Input
                id="cc-address-number"
                inputMode="numeric"
                placeholder="123"
                value={addressNumber}
                onChange={(e) => setAddressNumber(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-phone">Telefone do titular (opcional)</Label>
            <Input
              id="cc-phone"
              inputMode="tel"
              placeholder="(00) 90000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <span>
              Pagamento processado pelo Asaas com criptografia. O aplicativo
              nunca armazena o número completo nem o código de segurança do
              cartão — apenas a bandeira e os 4 últimos dígitos.
            </span>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={!valid || loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
