import type { ProgramEndForm, ProgramFormField, ProgramFormConsent } from '@/types';
import { generateId } from '@/lib/utils';

/** Champs par défaut du formulaire de fin (alignés sur les anciennes coordonnées). */
export function defaultEndFormFields(): ProgramFormField[] {
  return [
    { id: `field_${generateId()}`, type: 'short_text', label: 'Nom complet', placeholder: 'Votre nom', required: true },
    { id: `field_${generateId()}`, type: 'phone', label: 'Téléphone', placeholder: '+221 …', required: true },
    { id: `field_${generateId()}`, type: 'email', label: 'Email', placeholder: 'vous@email.com', required: false },
    { id: `field_${generateId()}`, type: 'short_text', label: 'Ville actuelle', placeholder: 'Dakar, Thiès…', required: true },
    { id: `field_${generateId()}`, type: 'select', label: 'Statut professionnel', required: true, options: ['Étudiant', 'Salarié', 'Entrepreneur', 'Sans emploi'] },
    { id: `field_${generateId()}`, type: 'radio', label: 'Activité actuelle', required: false, options: ['À temps plein', 'À temps partiel', 'Projet en idée'] },
    { id: `field_${generateId()}`, type: 'long_text', label: 'Motivation', required: false, maxLength: 280 },
  ];
}

/** Consentements RGPD par défaut. */
export function defaultEndFormConsents(partnerShortName = 'le programme'): ProgramFormConsent[] {
  return [
    { id: `consent_${generateId()}`, label: `Traitement des données dans le cadre du programme`, required: true, enabled: true },
    { id: `consent_${generateId()}`, label: `Acceptation d'être recontacté par ${partnerShortName}`, required: true, enabled: true },
    { id: `consent_${generateId()}`, label: 'Newsletter Startup Ludo (optionnel)', required: false, enabled: true },
  ];
}

export function defaultEndForm(partnerShortName?: string): ProgramEndForm {
  return {
    fields: defaultEndFormFields(),
    consents: defaultEndFormConsents(partnerShortName),
  };
}
