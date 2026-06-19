import type { ContentLang } from '@/components/events/LangTabs';
import type { TitleDescTranslation } from '@/types';

/** Type minimal commun à Funding / Opportunity / ChallengeEvent. */
interface TitleDescItem {
  title: string;
  description: string;
  translations?: Record<string, TitleDescTranslation>;
}

/**
 * Helpers pour éditer le titre/description dans la langue courante.
 * En 'fr' on lit/écrit les champs originaux ; en 'en' on lit/écrit translations.en.
 */
export function titleDescLang<T extends TitleDescItem>(
  formData: T,
  lang: ContentLang,
  setFormData: (updater: (prev: T) => T) => void,
) {
  const tr = formData.translations?.en;
  const title = lang === 'fr' ? formData.title : (tr?.title ?? '');
  const description = lang === 'fr' ? formData.description : (tr?.description ?? '');

  const setTitle = (v: string) =>
    lang === 'fr'
      ? setFormData((p) => ({ ...p, title: v }))
      : setFormData((p) => ({ ...p, translations: { ...p.translations, en: { title: v, description: p.translations?.en?.description ?? '' } } }));

  const setDescription = (v: string) =>
    lang === 'fr'
      ? setFormData((p) => ({ ...p, description: v }))
      : setFormData((p) => ({ ...p, translations: { ...p.translations, en: { title: p.translations?.en?.title ?? '', description: v } } }));

  return { title, description, setTitle, setDescription };
}
