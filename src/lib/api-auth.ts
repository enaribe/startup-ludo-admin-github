/**
 * Authentification des routes API du back-office.
 *
 * POURQUOI CE MODULE — jusqu'ici, seul `/api/admins` vérifiait l'appelant, avec un
 * `requireAdmin()` privé. Les routes de contenu (`/api/generate`, `/api/extract`)
 * étaient, elles, **totalement ouvertes** : n'importe qui connaissant l'URL pouvait
 * consommer le quota OpenAI/Anthropic ou pousser 25 Mo à extraire. Tant que ces
 * routes n'étaient appelées que par des admins internes le risque restait contenu ;
 * dès qu'on les expose à des enseignants d'établissements clients (Mode Classe),
 * ce n'est plus tenable.
 *
 * Le contrôle est donc extrait ici, en un seul point, et les routes s'y branchent.
 *
 * MODÈLE DE VÉRITÉ — le périmètre d'un appelant est lu **dans son ID token**
 * (custom claims posés par `/api/admins`), jamais dans le corps de la requête.
 * Un appelant ne peut donc pas s'auto-attribuer un établissement ou des classes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

/** Compte super admin historique, reconnu par son e-mail en plus de son claim. */
const SUPER_ADMIN_EMAIL = 'startupludo@concree.com';

/**
 * Appelant authentifié d'une route API, avec son périmètre issu des claims.
 *
 * Les booléens ne sont PAS exclusifs entre eux : un compte porte un rôle, mais
 * `classIds` est orthogonal (un directeur qui enseigne en a aussi, cf. SPEC §2.2).
 */
export interface ApiCaller {
  /** UID Firebase de l'appelant. */
  uid: string;
  /** E-mail de l'appelant, tel que porté par le token (peut être absent). */
  email: string | null;
  /** Super admin Concree : accès complet. */
  isSuper: boolean;
  /** Admin de programme (claim `admin`, hors rôles scolaires et sponsor). */
  isProgramAdmin: boolean;
  /** Admin de partenaire. */
  isPartner: boolean;
  /** Compte sponsor (périmètre borné à ses éditions). */
  isSponsor: boolean;
  /** Directeur d'établissement (Mode Classe). */
  isEstablishmentAdmin: boolean;
  /** Enseignant (Mode Classe). */
  isTeacher: boolean;
  /** Raccourci : l'un OU l'autre des rôles scolaires. */
  isSchoolRole: boolean;
  /** Partenaire de rattachement, ou `null`. */
  partnerId: string | null;
  /** Établissement de rattachement (rôles scolaires), ou `null`. */
  establishmentId: string | null;
  /** Classes enseignées par l'appelant (claim `classIds`), sinon tableau vide. */
  classIds: string[];
}

/** Extrait la valeur d'un claim en tableau de chaînes, tolérant à l'absence. */
function claimIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/**
 * Vérifie l'ID token `Authorization: Bearer <idToken>` et retourne l'appelant,
 * ou `null` si le jeton est absent, invalide, expiré, ou si le compte ne porte
 * aucun rôle back-office.
 *
 * ⚠️ Ne fait AUCUN contrôle de périmètre : c'est à la route d'exiger ce qu'elle
 * doit exiger à partir de l'`ApiCaller` retourné.
 */
export async function verifierAppelant(req: NextRequest): Promise<ApiCaller | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const email = typeof decoded.email === 'string' ? decoded.email : null;
    const isSuper = decoded.super_admin === true || email === SUPER_ADMIN_EMAIL;
    const isPartner = decoded.partner_admin === true;
    const isSponsor = decoded.sponsor === true;
    const isEstablishmentAdmin = decoded.establishment_admin === true;
    const isTeacher = decoded.teacher === true;
    const isSchoolRole = isEstablishmentAdmin || isTeacher;
    // Même convention que les règles Firestore : `admin: true` est posé sur TOUS
    // les rôles du back-office. Un « admin de programme » est donc le porteur du
    // claim MOINS les rôles qui ont leur propre périmètre.
    const isProgramAdmin =
      decoded.admin === true && !isSuper && !isPartner && !isSponsor && !isSchoolRole;

    const aUnRole = isSuper || isPartner || isSponsor || isSchoolRole || isProgramAdmin;
    if (!aUnRole) return null;

    return {
      uid: decoded.uid,
      email,
      isSuper,
      isProgramAdmin,
      isPartner,
      isSponsor,
      isEstablishmentAdmin,
      isTeacher,
      isSchoolRole,
      partnerId: typeof decoded.partnerId === 'string' ? decoded.partnerId : null,
      establishmentId: typeof decoded.establishmentId === 'string' ? decoded.establishmentId : null,
      classIds: claimIds(decoded.classIds),
    };
  } catch {
    return null;
  }
}

/**
 * Exige un compte habilité à produire du contenu pédagogique (`/api/generate`,
 * `/api/extract`).
 *
 * QUI EST AUTORISÉ — tous les rôles qui ont un écran de contenu :
 *   - super admin, admin de programme, admin de partenaire → `/studio`, `/editions`,
 *     `/programs`, `/personas` (les appelants historiques : ils ne doivent pas casser) ;
 *   - **rôles scolaires** → le wizard de séance, où l'enseignant dépose son cours
 *     et génère le contenu de sa classe.
 *
 * QUI NE L'EST PAS — le sponsor : son périmètre se limite au champ `sponsor` d'une
 * édition (cf. règles Firestore), il n'a aucun écran de génération. L'exclure ici
 * évite qu'un compte acheté pour de la visibilité serve de robinet à quota IA.
 *
 * Retourne l'appelant, ou une `NextResponse` d'erreur prête à être renvoyée.
 */
export async function exigerAuteurDeContenu(
  req: NextRequest
): Promise<{ caller: ApiCaller } | { reponse: NextResponse }> {
  const caller = await verifierAppelant(req);
  if (!caller) {
    return {
      reponse: NextResponse.json(
        { error: 'Authentification requise.' },
        { status: 401 }
      ),
    };
  }
  if (caller.isSponsor && !caller.isSuper) {
    return {
      reponse: NextResponse.json(
        { error: "Ce compte n'est pas autorisé à générer du contenu." },
        { status: 403 }
      ),
    };
  }
  return { caller };
}
