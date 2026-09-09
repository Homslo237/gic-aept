/*
  ============================================================
  AFFILIATION.JS — Programme de parrainage Homs-Water Manager
  ============================================================
  Fichier de fonctions UTILITAIRES PURES (aucun React/JSX ici),
  pour pouvoir être chargé partout : index.html, admin.html et
  parrainage.html. Pour le composant visuel React "Mes filleuls",
  voir affiliation-widget.js (réservé aux pages avec React/Babel).

  IMPORTANT : un parrain n'est PAS forcément un SDE avec un compte
  dans l'app. C'est une personne à part (étudiant, agent, curieux...)
  identifiée par nom + numéro WhatsApp + code PIN à 4 chiffres.
  Ses infos vivent dans la collection Firestore "affiliates",
  complètement séparée de "users" (réservée aux SDEs).

  Règle du programme : 20% du montant de l'abonnement du filleul,
  chaque mois, pendant 12 mois maximum à partir de sa date d'inscription.
  Le paiement reste 100% manuel : Jacques valide (admin.html), puis le
  parrain confirme avoir reçu (parrainage.html).
*/

(function () {

  const COMMISSION_RATE = 0.20;      // 20%
  const COMMISSION_MONTHS_MAX = 12;  // pendant 12 mois

  // Prix des plans en FCFA — DOIT rester identique à la grille officielle.
  const PLAN_PRICES = {
    starter: 0,
    essentiel: 5000,
    pro: 10000,
    premium: 15000,
  };

  // ---------- Génération du code de parrainage ----------
  // Ex: "Jean Mballa" -> "JEANMBAL-4F2A"
  function genCode(nom) {
    const base = (nom || "PARRAIN")
      .toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "PARRAIN";
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return base + "-" + suffix;
  }

  // ---------- Hachage simple du code PIN (évite de le stocker en clair) ----------
  // NB : ceci protège contre une lecture accidentelle des données, pas contre
  // une attaque sérieuse — sans backend (Firebase gratuit), la sécurité forte
  // n'est pas possible ici. Choix assumé pour rester simple.
  async function hashPin(pin) {
    const enc = new TextEncoder().encode("homslo-salt-" + pin);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- Nombre de mois écoulés depuis une date (max 12) ----------
  function moisEcoules(dateDebutISO) {
    if (!dateDebutISO) return 0;
    const debut = new Date(dateDebutISO);
    const maintenant = new Date();
    const mois = (maintenant.getFullYear() - debut.getFullYear()) * 12 +
                 (maintenant.getMonth() - debut.getMonth());
    return Math.max(0, Math.min(mois + 1, COMMISSION_MONTHS_MAX));
  }

  // ---------- Mois courant au format "2026-09" ----------
  function moisActuel() {
    return new Date().toISOString().slice(0, 7);
  }

  // ================= Collection "affiliates" (parrains, indépendants des SDEs) =================

  // Inscription d'un nouveau parrain. Retourne { id, ... } ou lève une erreur si le numéro existe déjà.
  async function inscrireAffilie(db, opts) {
    const nom = opts.nom, whatsapp = opts.whatsapp, pin = opts.pin;
    const whatsappPropre = whatsapp.replace(/\D/g, ""); // garder que les chiffres
    const existant = await db.collection("affiliates").where("whatsapp", "==", whatsappPropre).limit(1).get();
    if (!existant.empty) throw new Error("Ce numéro WhatsApp est déjà inscrit comme parrain.");

    const pinHash = await hashPin(pin);
    const referralCode = genCode(nom);
    const doc = await db.collection("affiliates").add({
      nom: nom.trim(),
      whatsapp: whatsappPropre,
      pinHash: pinHash,
      referralCode: referralCode,
      createdAt: new Date().toISOString(),
    });
    return { id: doc.id, nom: nom, whatsapp: whatsappPropre, referralCode: referralCode };
  }

  // Connexion d'un parrain existant (numéro + PIN). Retourne le profil ou null si incorrect.
  async function connecterAffilie(db, opts) {
    const whatsappPropre = opts.whatsapp.replace(/\D/g, "");
    const pinHash = await hashPin(opts.pin);
    const snap = await db.collection("affiliates")
      .where("whatsapp", "==", whatsappPropre).where("pinHash", "==", pinHash).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return Object.assign({ id: doc.id }, doc.data());
  }

  // ---------- Recherche d'un parrain à partir d'un code saisi à l'inscription d'un SDE ----------
  // Retourne { id, nom } ou null si le code n'existe pas.
  async function trouverParrain(db, codeParrain) {
    if (!codeParrain || !codeParrain.trim()) return null;
    const code = codeParrain.trim().toUpperCase();
    const snap = await db.collection("affiliates").where("referralCode", "==", code).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, nom: doc.data().nom || "Parrain" };
  }

  // ---------- Marquer une commission comme payée (côté admin Homslo/Vision) ----------
  async function marquerPaye(db, opts) {
    const id = opts.affiliateId + "_" + opts.refereeUid + "_" + opts.mois;
    await db.collection("affiliateCommissions").doc(id).set({
      affiliateId: opts.affiliateId, refereeUid: opts.refereeUid, mois: opts.mois, montant: opts.montant,
      status: "paid_by_admin",
      paidAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ---------- Le parrain confirme avoir reçu (côté parrainage.html) ----------
  async function confirmerReception(db, opts) {
    const id = opts.affiliateId + "_" + opts.refereeUid + "_" + opts.mois;
    await db.collection("affiliateCommissions").doc(id).set({
      status: "confirmed_by_referrer",
      confirmedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // ---------- Liste de toutes les commissions dues ce mois-ci, tous parrains confondus ----------
  // Utilisé par admin.html pour afficher le tableau et le bouton "Marquer comme payé".
  // Retourne un tableau de { affiliateId, affiliateNom, affiliateWhatsapp, refereeUid, refereeNom,
  //                          plan, mois, montant, status }
  async function listerCommissionsDuMois(db) {
    const mois = moisActuel();

    const [affiliatesSnap, usersSnap, commissionsSnap] = await Promise.all([
      db.collection("affiliates").get(),
      db.collection("users").get(),
      db.collection("affiliateCommissions").where("mois", "==", mois).get(),
    ]);

    const affiliatesById = {};
    affiliatesSnap.forEach(function(d) { affiliatesById[d.id] = d.data(); });

    const commissionsById = {};
    commissionsSnap.forEach(function(d) { commissionsById[d.id] = d.data(); });

    const lignes = [];
    usersSnap.forEach(function(d) {
      const u = d.data();
      if (!u.referredByAffiliateId) return;
      const affilie = affiliatesById[u.referredByAffiliateId];
      if (!affilie) return; // parrain supprimé entre-temps

      const prixPlan = PLAN_PRICES[u.plan] || 0;
      if (prixPlan <= 0) return; // pas de commission sur un plan gratuit

      const montant = Math.round(prixPlan * COMMISSION_RATE);
      const id = u.referredByAffiliateId + "_" + d.id + "_" + mois;
      const comm = commissionsById[id];

      lignes.push({
        id: id,
        affiliateId: u.referredByAffiliateId,
        affiliateNom: affilie.nom || "Parrain",
        affiliateWhatsapp: affilie.whatsapp || "",
        refereeUid: d.id,
        refereeNom: u.nom || "SDE",
        plan: u.plan || "starter",
        mois: mois,
        montant: montant,
        status: (comm && comm.status) || "estime",
      });
    });

    return lignes;
  }

  window.Affiliation = {
    COMMISSION_RATE: COMMISSION_RATE,
    COMMISSION_MONTHS_MAX: COMMISSION_MONTHS_MAX,
    PLAN_PRICES: PLAN_PRICES,
    genCode: genCode,
    hashPin: hashPin,
    moisEcoules: moisEcoules,
    moisActuel: moisActuel,
    inscrireAffilie: inscrireAffilie,
    connecterAffilie: connecterAffilie,
    trouverParrain: trouverParrain,
    marquerPaye: marquerPaye,
    confirmerReception: confirmerReception,
    listerCommissionsDuMois: listerCommissionsDuMois,
  };

})();
