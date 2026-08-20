'use client';

/**
 * Inscription libre du back-office (plan I2) — 4 types de comptes.
 *
 * Le compte Firebase Auth est créé ICI (l'utilisateur garde son mot de passe),
 * la vérification d'e-mail part via Firebase, puis la DEMANDE est enregistrée
 * par `/api/inscription`. Trois issues possibles, affichées sur place :
 *   - établissement + code de licence valide → activé immédiatement
 *     (reconnexion demandée : les claims ne vivent qu'au prochain jeton) ;
 *   - établissement SANS code (école qui découvre CONCREE) → demande examinée
 *     par CONCREE (/moderation), qui crée l'établissement à l'approbation ;
 *   - enseignant → « votre direction va vous affecter » ;
 *   - annonceur / partenaire → « CONCREE examine sous 48 h ».
 * Un compte déjà connecté avec une demande en cours voit son STATUT au lieu
 * du formulaire — cette page est aussi l'écran d'attente.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Building2, GraduationCap, Megaphone, School } from 'lucide-react';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

type TypeCompte = 'establishment' | 'teacher' | 'sponsor' | 'partner';

const TYPES: Array<{ id: TypeCompte; titre: string; texte: string; Icon: typeof School; codeLabel?: string }> = [
  { id: 'establishment', titre: 'Établissement', texte: 'École, université, centre de formation — avec ou sans code de licence.', Icon: School, codeLabel: 'Code de licence — si vous en avez reçu un (ex. EST-ISM-2026)' },
  { id: 'teacher', titre: 'Enseignant', texte: 'Rejoignez votre établissement — votre direction validera et vous affectera vos classes.', Icon: GraduationCap, codeLabel: 'Code établissement (remis par votre direction)' },
  { id: 'sponsor', titre: 'Annonceur', texte: 'Structure d’appui, banque, programme — diffusez vos opportunités dans le jeu.', Icon: Megaphone },
  { id: 'partner', titre: 'Partenaire', texte: 'Incubateur ou institution avec un programme d’accompagnement sur Startup Ludo.', Icon: Building2 },
];

export default function InscriptionPage() {
  const [type, setType] = useState<TypeCompte | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<'pending' | 'approved' | null>(null);
  const [statutExistant, setStatutExistant] = useState<{ status: string; motif?: string } | null>(null);

  // Déjà connecté avec une demande ? La page devient l'écran de statut.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(firestore, COLLECTIONS.signupRequests, uid))
      .then((snap) => {
        if (snap.exists()) {
          setStatutExistant(snap.data() as { status: string; motif?: string });
        }
      })
      .catch(() => {});
  }, []);

  const soumettre = async () => {
    if (!type) return;
    setErreur('');
    setEnCours(true);
    try {
      // 1. Le compte Auth (ou reconnexion si l'e-mail existe déjà : le candidat
      //    revient peut-être après un refus, avec le même mot de passe).
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email.trim(), motDePasse);
        void sendEmailVerification(cred.user).catch(() => {});
      } catch (e: unknown) {
        const codeErr = (e as { code?: string }).code ?? '';
        if (codeErr === 'auth/email-already-in-use') {
          // L'e-mail a déjà un compte (essai précédent, autre inscription…) :
          // on tente la reconnexion avec le mot de passe saisi. S'il ne
          // correspond pas, on l'explique — l'erreur brute de Firebase
          // (« auth/invalid-credential ») ne dit rien à un directeur d'école.
          try {
            cred = { user: (await signInWithEmailAndPassword(auth, email.trim(), motDePasse)).user };
          } catch {
            throw new Error(
              'Un compte existe déjà avec cet e-mail, mais le mot de passe saisi ne correspond pas. ' +
                'Saisissez le mot de passe choisi lors de votre première tentative, ou réinitialisez-le ' +
                'depuis la page de connexion (« Mot de passe oublié ? »), puis revenez ici.'
            );
          }
        } else if (codeErr === 'auth/weak-password') {
          throw new Error('Mot de passe trop court (6 caractères minimum).');
        } else if (codeErr === 'auth/invalid-email') {
          throw new Error('Adresse e-mail invalide.');
        } else {
          throw new Error('Création du compte impossible — vérifiez e-mail et mot de passe.');
        }
      }

      // 2. La demande, côté serveur.
      const token = await cred.user.getIdToken();
      const res = await fetch('/api/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, displayName: displayName.trim(), orgName: orgName.trim(), code: code.trim() }),
      });
      const json = (await res.json()) as { error?: string; status?: 'pending' | 'approved' };
      if (!res.ok || json.error) throw new Error(json.error || 'Inscription impossible.');
      setResultat(json.status ?? 'pending');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Inscription impossible.');
    } finally {
      setEnCours(false);
    }
  };

  // ═══ Écrans de statut ═══
  if (resultat || statutExistant) {
    const status = resultat ?? statutExistant?.status;
    return (
      <Cadre>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 10 }}>
          {status === 'approved' ? 'Votre espace est prêt !' : status === 'rejected' ? 'Demande non retenue' : 'Demande bien reçue'}
        </h1>
        <p style={{ fontSize: 13.5, color: '#3D4C61', lineHeight: 1.65 }}>
          {status === 'approved' &&
            'Votre compte est activé. Reconnectez-vous pour charger vos accès — puis laissez-vous guider.'}
          {status === 'pending' &&
            'Votre demande est en cours d’examen. Vous recevrez un e-mail dès l’activation — vous pourrez alors vous connecter normalement.'}
          {status === 'rejected' && (
            <>Motif : {statutExistant?.motif || '—'}. Vous pouvez soumettre une nouvelle demande.</>
          )}
        </p>
        <Link
          href="/login"
          style={{ display: 'inline-block', marginTop: 18, background: ORANGE, color: NAVY, fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, textDecoration: 'none' }}
        >
          Aller à la connexion
        </Link>
      </Cadre>
    );
  }

  // ═══ Choix du type ═══
  if (!type) {
    return (
      <Cadre large>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Créer un compte</h1>
        <p style={{ fontSize: 13, color: '#5A6A70', margin: '6px 0 20px' }}>
          Choisissez votre profil — l’activation dépend du type de compte.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TYPES.map(({ id, titre, texte, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setType(id)}
              style={{ textAlign: 'left', padding: 18, borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(15,28,46,0.12)', background: '#FFF' }}
            >
              <Icon size={20} color={NAVY} />
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 8 }}>{titre}</div>
              <div style={{ fontSize: 12, color: '#5A6A70', marginTop: 4, lineHeight: 1.55 }}>{texte}</div>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: '#5A6A70', marginTop: 18 }}>
          Déjà un compte ? <Link href="/login" style={{ color: NAVY, fontWeight: 700 }}>Se connecter</Link>
        </p>
      </Cadre>
    );
  }

  // ═══ Formulaire ═══
  const meta = TYPES.find((t) => t.id === type)!;
  return (
    <Cadre>
      <button type="button" onClick={() => setType(null)} style={{ border: 'none', background: 'none', color: '#5A6A70', fontSize: 12.5, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        ← Changer de profil
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 14 }}>
        Compte {meta.titre.toLowerCase()}
      </h1>
      <div className="flex flex-col gap-3">
        <Champ label="Votre nom complet" value={displayName} onChange={setDisplayName} placeholder="Ex. Awa Ndiaye" />
        {type === 'establishment' && (
          <Champ label="Nom de votre établissement" value={orgName} onChange={setOrgName} placeholder="Ex. Lycée Blaise Diagne" />
        )}
        {(type === 'sponsor' || type === 'partner') && (
          <Champ label="Nom de votre structure" value={orgName} onChange={setOrgName} placeholder="Ex. ADEPME" />
        )}
        {meta.codeLabel && <Champ label={meta.codeLabel} value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="XXX-XXX-XXXX" />}
        <Champ label="E-mail professionnel" value={email} onChange={setEmail} type="email" placeholder="vous@structure.sn" />
        <Champ label="Mot de passe" value={motDePasse} onChange={setMotDePasse} type="password" placeholder="6 caractères minimum" />
        {erreur && <p style={{ fontSize: 12.5, color: '#C0392B' }}>{erreur}</p>}
        <button
          type="button"
          disabled={
            enCours ||
            !displayName.trim() ||
            !email.trim() ||
            motDePasse.length < 6 ||
            // Le code n'est OBLIGATOIRE que pour un enseignant (il désigne son
            // établissement). Un établissement sans code envoie une demande —
            // il lui faut alors au moins le nom de l'école.
            (type === 'teacher' && !code.trim()) ||
            (type === 'establishment' && !orgName.trim())
          }
          onClick={() => void soumettre()}
          style={{ background: ORANGE, color: NAVY, fontWeight: 800, fontSize: 14, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', opacity: enCours ? 0.6 : 1 }}
        >
          {enCours
            ? 'Création…'
            : type === 'establishment'
              ? code.trim()
                ? 'Activer ma licence'
                : 'Envoyer ma demande'
              : 'Envoyer ma demande'}
        </button>
        <p style={{ fontSize: 11.5, color: '#8A94A6', lineHeight: 1.5 }}>
          Un e-mail de vérification vous sera envoyé.{' '}
          {type === 'establishment'
            ? 'Avec un code de licence, votre espace s’active immédiatement. Sans code, l’équipe CONCREE examine votre demande (48 h ouvrées) et vous recontacte.'
            : type === 'teacher'
              ? 'Votre direction validera votre compte et vos classes.'
              : 'L’équipe CONCREE valide les demandes sous 48 h ouvrées.'}
        </p>
      </div>
    </Cadre>
  );
}

function Cadre({ children, large }: { children: React.ReactNode; large?: boolean }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F4EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: large ? 640 : 440, background: '#FFF', borderRadius: 16, border: '1px solid rgba(15,28,46,0.1)', padding: '26px 26px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: ORANGE, marginBottom: 14 }}>
          STARTUP LUDO · CONCREE
        </div>
        {children}
      </div>
    </div>
  );
}

function Champ({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ fontSize: 12, color: '#5A6A70' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: '1px solid rgba(15,28,46,0.15)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none' }}
      />
    </label>
  );
}
