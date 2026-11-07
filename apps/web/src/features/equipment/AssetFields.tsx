import { COMMON_ASSET_KINDS } from '@klasbak/shared';
import { useTranslation } from 'react-i18next';
import { Field, inputHeight } from '../../components/ui/Form';
import { useAssets } from './api';
import { suggestions } from './stock';

export type AssetFieldValues = {
  kind: string;
  name: string;
  location: string;
  purchasedOn: string;
  warrantyUntil: string;
  note: string;
};

export const emptyAssetFields: AssetFieldValues = {
  kind: 'Chromebook',
  name: '',
  location: '',
  purchasedOn: '',
  warrantyUntil: '',
  note: '',
};

/** Form values as the API wants them: an empty field is a field left out. */
export function assetDetails(values: AssetFieldValues) {
  return {
    kind: values.kind,
    name: values.name,
    location: values.location || undefined,
    purchasedOn: values.purchasedOn || undefined,
    warrantyUntil: values.warrantyUntil || undefined,
    note: values.note || undefined,
  };
}

/** What one item and a whole delivery have in common. */
export function AssetFields({
  values,
  onChange,
  showErrors,
}: {
  values: AssetFieldValues;
  onChange: (values: AssetFieldValues) => void;
  showErrors: boolean;
}) {
  const { t } = useTranslation();
  const assets = useAssets();
  const set = (field: keyof AssetFieldValues, value: string) =>
    onChange({ ...values, [field]: value });
  const required = (value: string) =>
    showErrors && !value.trim() ? t('equipment.form.required') : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('equipment.form.kind')} required error={required(values.kind)}>
        {(props) => (
          <>
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              list="asset-kinds"
              value={values.kind}
              onChange={(e) => set('kind', e.target.value)}
            />
            <datalist id="asset-kinds">
              {suggestions(assets.data?.map((a) => a.kind) ?? [], COMMON_ASSET_KINDS).map(
                (kind) => (
                  <option key={kind} value={kind} />
                ),
              )}
            </datalist>
          </>
        )}
      </Field>
      <Field
        label={t('equipment.form.name')}
        hint={t('equipment.form.nameHint')}
        required
        error={required(values.name)}
      >
        {(props) => (
          <input
            {...props}
            className={`${props.className} ${inputHeight}`}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        )}
      </Field>
      <Field label={t('equipment.location')} hint={t('equipment.form.locationHint')}>
        {(props) => (
          <>
            <input
              {...props}
              className={`${props.className} ${inputHeight}`}
              list="asset-locations"
              value={values.location}
              onChange={(e) => set('location', e.target.value)}
            />
            <datalist id="asset-locations">
              {suggestions(assets.data?.map((a) => a.location) ?? []).map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('equipment.form.purchasedOn')}>
          {(props) => (
            <input
              {...props}
              type="date"
              className={`${props.className} ${inputHeight}`}
              value={values.purchasedOn}
              onChange={(e) => set('purchasedOn', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('equipment.form.warrantyUntil')}>
          {(props) => (
            <input
              {...props}
              type="date"
              className={`${props.className} ${inputHeight}`}
              value={values.warrantyUntil}
              onChange={(e) => set('warrantyUntil', e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field
        label={t('equipment.form.note')}
        hint={t('equipment.form.noteHint')}
        className="sm:col-span-2"
      >
        {(props) => (
          <textarea
            {...props}
            className={`${props.className} py-2`}
            rows={2}
            maxLength={500}
            value={values.note}
            onChange={(e) => set('note', e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}
