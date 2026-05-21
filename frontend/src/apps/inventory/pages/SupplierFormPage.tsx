import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check, Truck } from 'lucide-react';
import { Breadcrumb } from '@/components/data-display';
import { Card } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import {
  FormErrorContainer,
  FormInput,
  FormTextarea,
} from '@/components/form';
import {
  createSupplier,
  fetchSupplier,
  updateSupplier,
  type Supplier,
} from '@/features/inventory';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const schema = z.object({
  name: z.string().min(2, 'Supplier name must be at least 2 characters'),
  gstin: z
    .string()
    .optional()
    .refine(
      (v) => !v || GSTIN_REGEX.test(v),
      'GSTIN must match the 15-char format (e.g. 27ABCDE1234F1Z5)',
    ),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Enter a valid email address',
    ),
  address: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const blankValues: FormValues = {
  name: '',
  gstin: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  isActive: true,
};

const toFormValues = (s: Supplier): FormValues => ({
  name: s.name,
  gstin: s.gstin ?? '',
  contactPerson: s.contactPerson ?? '',
  phone: s.phone ?? '',
  email: s.email ?? '',
  address: s.address ?? '',
  isActive: s.isActive,
});

const cleanOptional = (raw: string | undefined): string | undefined => {
  const trimmed = (raw ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Supplier add/edit form. Add mode lives at `/inventory/suppliers/new`,
 * edit mode at `/inventory/suppliers/:id/edit`. The route's `:id` param
 * is the only signal — there's no separate component per mode so the
 * form, validation, and header layout stay in one place.
 *
 * Header pattern matches the rest of the inventory sub-pages: ghost
 * back-link above the title in the left column, primary Save + Cancel
 * CTAs aligned to `items-start` of the row.
 */
export function SupplierFormPage(): JSX.Element {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState<boolean>(isEdit);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blankValues,
  });

  useEffect(() => {
    if (!isEdit || !id) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchSupplier(id)
      .then((s) => {
        if (!alive) return;
        setSupplier(s);
        if (s) reset(toFormValues(s));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, isEdit, reset]);

  const back = (): void => navigate('/inventory/suppliers');

  const onSubmit = async (values: FormValues): Promise<void> => {
    setSubmitError(null);
    try {
      const payload = {
        name: values.name.trim(),
        gstin: cleanOptional(values.gstin),
        contactPerson: cleanOptional(values.contactPerson),
        phone: cleanOptional(values.phone),
        email: cleanOptional(values.email),
        address: cleanOptional(values.address),
        isActive: values.isActive,
      };
      if (isEdit && id) {
        await updateSupplier(id, payload);
      } else {
        await createSupplier(payload);
      }
      back();
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? e.message
          : isEdit
            ? 'Could not save supplier changes.'
            : 'Could not create supplier.',
      );
    }
  };

  const title = isEdit ? 'Edit supplier' : 'Add supplier';

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb
        items={[
          { label: 'Suppliers', to: '/inventory/suppliers' },
          { label: isEdit ? supplier?.name ?? 'Edit' : 'Add' },
        ]}
        homeTo="/inventory/medicines"
        homeLabel="Inventory"
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={back}
            className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft /> Back to suppliers
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Truck className="h-4 w-4 text-primary" />
            {title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            GST registration number is optional but required to claim input tax
            credit on the resulting GRNs.
          </p>
        </div>
        {(!isEdit || supplier) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner size="sm" /> : <Check />}
              {isSubmitting
                ? 'Saving…'
                : isEdit
                  ? 'Save supplier'
                  : 'Create supplier'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={back}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" /> Loading supplier…
        </div>
      ) : isEdit && !supplier ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Supplier not found.
          </p>
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={back}>
              Back to suppliers
            </Button>
          </div>
        </Card>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {submitError && (
            <FormErrorContainer
              title={isEdit ? 'Could not save supplier.' : 'Could not create supplier.'}
              description={submitError}
              onRetry={handleSubmit(onSubmit)}
            />
          )}

          <Card padding="md" elevation="elevated" className="gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Identity
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <FormInput
                  label="Supplier name"
                  requiredMark
                  error={errors.name?.message}
                  {...register('name')}
                />
                <FormInput
                  label="GSTIN"
                  hint="15-char GST registration number (optional)"
                  error={errors.gstin?.message}
                  {...register('gstin')}
                />
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Contact
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                <FormInput
                  label="Contact person"
                  error={errors.contactPerson?.message}
                  {...register('contactPerson')}
                />
                <FormInput
                  label="Phone"
                  error={errors.phone?.message}
                  {...register('phone')}
                />
                <div className="md:col-span-2">
                  <FormInput
                    label="Email"
                    type="email"
                    error={errors.email?.message}
                    {...register('email')}
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Address
              </h3>
              <FormTextarea
                label="Address"
                rows={3}
                placeholder="Street, locality, city, pincode, state"
                error={errors.address?.message}
                {...register('address')}
              />
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Status
              </h3>
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                  {...register('isActive')}
                />
                <span>Active — show this supplier in GRN pickers</span>
              </label>
            </section>
          </Card>
        </form>
      )}
    </div>
  );
}
