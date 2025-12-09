export const handleRetour = () => {
    // Si vous souhaitez revenir à une page précédente dans Next.js :
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Si pas d'historique, redirigez vers la racine
        window.location.href = "/";
      }
    }
  };