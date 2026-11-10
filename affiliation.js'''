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

  // Valeurs de secours — utilisées seulement si la configuration Firebase (config/plans)
  // n'existe pas encore ou est incomplète. Ne devrait jamais arriver en usage normal.
  // Nombre d'utilisateurs d'équipe autorisés EN PLUS de l'administrateur du SDE
  const PLAN_UTILISATEURS = { starter: 0, essentiel: 0, pro: 2, premium: 4 };

  const PLAN_DEFAULTS = {
    starter:   { label: "Starter",   prix: 0,     limite: 10, dureeMois: null }, // dureeMois : durée de la période gratuite (null = illimitée)
    essentiel: { label: "Essentiel", prix: 5000,  limite: 50 },
    pro:       { label: "Pro",       prix: 10000, limite: 300 },
    premium:   { label: "Premium",   prix: 15000, limite: null }, // null = illimité
  };

  // Ancienne constante conservée pour compatibilité (valeurs de secours uniquement).
  const PLAN_PRICES = {
    starter: PLAN_DEFAULTS.starter.prix,
    essentiel: PLAN_DEFAULTS.essentiel.prix,
    pro: PLAN_DEFAULTS.pro.prix,
    premium: PLAN_DEFAULTS.premium.prix,
  };

  // ---------- Charger la configuration réelle des tarifs depuis Firebase ----------
  // Fusionne avec PLAN_DEFAULTS pour ne jamais planter si un champ manque.
  async function chargerConfigPlans(db) {
    try {
      const doc = await db.collection("config").doc("plans").get();
      const data = doc.exists ? doc.data() : {};
      const config = {};
      for (const cle of Object.keys(PLAN_DEFAULTS)) {
        config[cle] = Object.assign({}, PLAN_DEFAULTS[cle], data[cle] || {});
      }
      return config;
    } catch (e) {
      return PLAN_DEFAULTS;
    }
  }

  // ---------- Enregistrer une nouvelle configuration de tarifs (admin uniquement) ----------
  async function enregistrerConfigPlans(db, config) {
    await db.collection("config").doc("plans").set(config, { merge: true });
  }

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
  // opts.accepteConditions doit être `true` : l'inscription est refusée sinon (case à cocher côté parrainage.html).
  async function inscrireAffilie(db, opts) {
    const nom = opts.nom, whatsapp = opts.whatsapp, pin = opts.pin;
    if (opts.accepteConditions !== true) {
      throw new Error("Vous devez accepter les conditions du programme de parrainage pour continuer.");
    }
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
      accepteConditions: true,
      conditionsAccepteesAt: new Date().toISOString(),
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

    const [affiliatesSnap, usersSnap, commissionsSnap, planConfig] = await Promise.all([
      db.collection("affiliates").get(),
      db.collection("users").get(),
      db.collection("affiliateCommissions").where("mois", "==", mois).get(),
      chargerConfigPlans(db),
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

      const prixPlan = (planConfig[u.plan] && planConfig[u.plan].prix) || 0;
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
    PLAN_DEFAULTS: PLAN_DEFAULTS,
    PLAN_UTILISATEURS: PLAN_UTILISATEURS,
    chargerConfigPlans: chargerConfigPlans,
    enregistrerConfigPlans: enregistrerConfigPlans,
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

/* ======================================================================================
   STOCKAGE « UNE CHEMISE PAR MOIS » (schema 2)
   Un SDE = un document principal (abonnés, réglages, logo…) + un document par mois
   (relevés, paiements, dépenses et recettes de ce mois). L'application rassemble tout en
   mémoire : les calculs ne changent pas. Fonctions pures, partagées avec la console admin.
   ====================================================================================== */
(function () {
  "use strict";
  var CHAMPS = ["releves", "paiements", "depensesLignes", "recettesDiverses"];
  var SANS_PERIODE = "sans-periode";
  var RE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

  function periodeValide(p) { return typeof p === "string" && RE_PERIODE.test(p) ? p : null; }
  function depuisDate(d) { return typeof d === "string" ? periodeValide(d.slice(0, 7)) : null; }
  function cleReleve(r) { return periodeValide(r && r.periode) || depuisDate(r && r.date) || SANS_PERIODE; }
  function cleLigne(x) { return periodeValide(x && x.periode) || depuisDate(x && x.date) || SANS_PERIODE; }
  // Un paiement suit son relevé (même mois) ; à défaut, le mois de sa date
  function clePaiement(p, relevesParId) {
    var r = p && p.releveId != null ? relevesParId[p.releveId] : null;
    return (r ? cleReleve(r) : null) || depuisDate(p && p.date) || SANS_PERIODE;
  }
  function chemiseVide() { return { releves: [], paiements: [], depensesLignes: [], recettesDiverses: [] }; }

  // data (ancien format, tout dans un objet) -> { main, periodes }
  function decouper(data) {
    var main = {};
    Object.keys(data || {}).forEach(function (k) { if (CHAMPS.indexOf(k) < 0) main[k] = data[k]; });
    main.schema = 2;
    var periodes = {};
    function mettre(cle, champ, x) { (periodes[cle] = periodes[cle] || chemiseVide())[champ].push(x); }
    var parId = {};
    (data.releves || []).forEach(function (r) { if (r && r.id != null) parId[r.id] = r; });
    (data.releves || []).forEach(function (r) { mettre(cleReleve(r), "releves", r); });
    (data.paiements || []).forEach(function (p) { mettre(clePaiement(p, parId), "paiements", p); });
    (data.depensesLignes || []).forEach(function (x) { mettre(cleLigne(x), "depensesLignes", x); });
    (data.recettesDiverses || []).forEach(function (x) { mettre(cleLigne(x), "recettesDiverses", x); });
    return { main: main, periodes: periodes };
  }

  function comparerCles(a, b) {
    if (a === SANS_PERIODE) return b === SANS_PERIODE ? 0 : 1;
    if (b === SANS_PERIODE) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // { main, periodes } -> data (ancien format). Relevés : mois croissants ; paiements, dépenses, recettes : mois décroissants
  function assembler(main, periodes) {
    var data = {};
    Object.keys(main || {}).forEach(function (k) { if (k !== "schema") data[k] = main[k]; });
    var asc = Object.keys(periodes || {}).sort(comparerCles);
    var desc = asc.filter(function (k) { return k !== SANS_PERIODE; }).reverse();
    if (asc.indexOf(SANS_PERIODE) >= 0) desc.push(SANS_PERIODE);
    function fusion(champ, cles) {
      var out = [];
      cles.forEach(function (k) { var a = periodes[k] && periodes[k][champ]; if (a && a.length) out = out.concat(a); });
      return out;
    }
    data.releves = fusion("releves", asc);
    data.paiements = fusion("paiements", desc);
    data.depensesLignes = fusion("depensesLignes", desc);
    data.recettesDiverses = fusion("recettesDiverses", desc);
    return data;
  }

  // Représentation textuelle stable (clés triées) : deux contenus identiques donnent la même signature
  function stable(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
  }
  function signaturesDe(periodes) {
    var s = {}; Object.keys(periodes || {}).forEach(function (k) { s[k] = stable(periodes[k]); }); return s;
  }
  // Que faut-il écrire / supprimer pour passer de l'état en base (signatures) à ces chemises ?
  function diff(signaturesEnBase, periodes) {
    var ecrire = [], supprimer = [];
    Object.keys(periodes).forEach(function (k) { if (signaturesEnBase[k] !== stable(periodes[k])) ecrire.push(k); });
    Object.keys(signaturesEnBase || {}).forEach(function (k) { if (!(k in periodes)) supprimer.push(k); });
    return { ecrire: ecrire, supprimer: supprimer };
  }
  function taille(o) { return JSON.stringify(o).length; }
  function plusGrosDocument(main, periodes) {
    var m = taille(main);
    Object.keys(periodes || {}).forEach(function (k) { var t = taille(periodes[k]); if (t > m) m = t; });
    return m;
  }
  function plusGrosDocumentDe(data) { var d = decouper(data); return plusGrosDocument(d.main, d.periodes); }

  // Deux jeux de données ont-ils le même contenu (sans tenir compte de l'ordre des enregistrements) ?
  function memeContenu(a, b) {
    var ok = true, detail = [];
    CHAMPS.forEach(function (c) {
      var x = (a[c] || []).map(stable).sort(), y = (b[c] || []).map(stable).sort();
      if (x.length !== y.length || x.some(function (v, i) { return v !== y[i]; })) { ok = false; detail.push(c + " : " + x.length + " ≠ " + y.length); }
    });
    var ka = Object.keys(a).filter(function (k) { return CHAMPS.indexOf(k) < 0 && k !== "schema"; });
    var kb = Object.keys(b).filter(function (k) { return CHAMPS.indexOf(k) < 0 && k !== "schema"; });
    var ensemble = {}; ka.concat(kb).forEach(function (k) { ensemble[k] = 1; });
    Object.keys(ensemble).forEach(function (k) { if (stable(a[k]) !== stable(b[k])) { ok = false; detail.push("champ « " + k + " » différent"); } });
    return { ok: ok, detail: detail };
  }

  window.Stockage = {
    CHAMPS: CHAMPS, SANS_PERIODE: SANS_PERIODE,
    decouper: decouper, assembler: assembler, stable: stable, signature: stable,
    signaturesDe: signaturesDe, diff: diff, taille: taille,
    plusGrosDocument: plusGrosDocument, plusGrosDocumentDe: plusGrosDocumentDe, memeContenu: memeContenu
  };
})();
