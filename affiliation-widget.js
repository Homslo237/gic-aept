/*
  ============================================================
  AFFILIATION-WIDGET.JS — Composant visuel "Mes filleuls"
  ============================================================
  Contient du JSX (React) — À CHARGER UNIQUEMENT dans une page qui a
  déjà React + Babel (type="text/babel"). Aujourd'hui : parrainage.html.

  NE PAS charger ce fichier dans admin.html (pas de React là-bas) —
  utiliser affiliation.js seul là-bas, avec window.Affiliation.listerCommissionsDuMois.

  Dépend de affiliation.js (doit être chargé AVANT ce fichier) pour
  window.Affiliation.moisEcoules / PLAN_PRICES / COMMISSION_RATE / confirmerReception.
*/

(function () {

  // Props : { db, affiliateId, myReferralCode }
  function MesFilleuls({ db, affiliateId, myReferralCode }) {
    const { useState, useEffect } = React;
    const { moisEcoules, PLAN_PRICES, COMMISSION_RATE, COMMISSION_MONTHS_MAX, confirmerReception, moisActuel } = window.Affiliation;

    const [filleuls, setFilleuls] = useState([]);
    const [commissions, setCommissions] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let annule = false;
      async function charger() {
        setLoading(true);
        const snap = await db.collection("users").where("referredByAffiliateId", "==", affiliateId).get();
        const liste = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        if (!annule) setFilleuls(liste);

        const commSnap = await db.collection("affiliateCommissions")
          .where("affiliateId", "==", affiliateId).get();
        const map = {};
        commSnap.docs.forEach(d => { map[d.id] = d.data(); });
        if (!annule) setCommissions(map);

        if (!annule) setLoading(false);
      }
      if (db && affiliateId) charger();
      return () => { annule = true; };
    }, [db, affiliateId]);

    const copierCode = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(myReferralCode);
    };

    const partagerWhatsApp = () => {
      const texte = `Connaissez-vous un SDE (service d'eau) qui gère encore tout sur papier ? Recommandez-lui Homs-Water Manager avec mon code ${myReferralCode} : https://homslo237.github.io/gic-aept`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank");
    };

    return (
      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
        <div style={{
          background: "linear-gradient(135deg,#0F5C6B,#0E7A8A)", borderRadius: 20,
          padding: 20, marginBottom: 20, color: "white",
        }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Votre code de parrainage</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1, marginBottom: 14 }}>{myReferralCode || "—"}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={copierCode} style={{
              flex: 1, padding: "10px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.12)", color: "white", fontWeight: 600, fontSize: 13,
            }}>📋 Copier</button>
            <button onClick={partagerWhatsApp} style={{
              flex: 1, padding: "10px", borderRadius: 14, border: "none",
              background: "#25D366", color: "white", fontWeight: 600, fontSize: 13,
            }}>💬 Partager</button>
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#0F5C6B" }}>
          Mes filleuls ({filleuls.length})
        </div>

        {loading && <div style={{ color: "#888", fontSize: 13 }}>Chargement...</div>}

        {!loading && filleuls.length === 0 && (
          <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
            Vous n'avez pas encore de filleul.<br/>Partagez votre code pour commencer à gagner 20% !
          </div>
        )}

        {filleuls.map(f => {
          const mois = moisEcoules(f.referralStartDate || f.createdAt);
          const prixPlan = PLAN_PRICES[f.plan] || 0;
          const montantMensuel = Math.round(prixPlan * COMMISSION_RATE);
          const moisCourant = moisActuel();
          const idComm = `${affiliateId}_${f.uid}_${moisCourant}`;
          const commissionCeMois = commissions[idComm];

          let statutLabel = "Estimation — pas encore validé";
          let statutColor = "#999";
          if (commissionCeMois?.status === "paid_by_admin") { statutLabel = "En attente de votre confirmation"; statutColor = "#E8A33D"; }
          if (commissionCeMois?.status === "confirmed_by_referrer") { statutLabel = "Payé ✓"; statutColor = "#2E9BB0"; }

          return (
            <div key={f.uid} style={{
              background: "white", borderRadius: 16, padding: 16, marginBottom: 12,
              border: "1px solid rgba(0,0,0,0.08)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{f.nom}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    Plan {f.plan || "starter"} · Mois {mois}/{COMMISSION_MONTHS_MAX}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#0F5C6B" }}>
                    {montantMensuel.toLocaleString()} FCFA
                  </div>
                  <div style={{ fontSize: 11, color: statutColor, fontWeight: 600 }}>{statutLabel}</div>
                </div>
              </div>
              {commissionCeMois?.status === "paid_by_admin" && (
                <button
                  onClick={async () => {
                    await confirmerReception(db, { affiliateId, refereeUid: f.uid, mois: moisCourant });
                    setCommissions(c => ({ ...c, [idComm]: { ...c[idComm], status: "confirmed_by_referrer" } }));
                  }}
                  style={{
                    marginTop: 10, width: "100%", padding: "9px", borderRadius: 12, border: "none",
                    background: "#2E9BB0", color: "white", fontWeight: 700, fontSize: 13,
                  }}
                >✓ J'ai bien reçu ce paiement</button>
              )}
            </div>
          );
        })}

        <p style={{ fontSize: 11, color: "#aaa", marginTop: 16, lineHeight: 1.5 }}>
          Les montants affichés sont estimés à partir du plan de vos filleuls.
          Jacques (Homslo/Vision) valide et vous paie manuellement chaque mois par
          Orange Money / MTN MoMo, puis vous confirmez ici la réception.
        </p>
      </div>
    );
  }

  window.Affiliation = window.Affiliation || {};
  window.Affiliation.MesFilleuls = MesFilleuls;

})();
