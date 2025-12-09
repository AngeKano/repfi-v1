import React from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-indigo-300 rounded-full opacity-20 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
            }}
          ></div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 animate-fadeIn">
        {/* Illustration */}
        <div className="mb-8 animate-slideDown">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full opacity-20 blur-lg group-hover:opacity-30 transition duration-500 animate-pulse-slow"></div>
            <svg
              width="140"
              height="140"
              viewBox="0 0 120 120"
              aria-hidden="true"
              className="mx-auto relative transform group-hover:scale-105 transition-transform duration-300"
            >
              <rect
                x="14"
                y="26"
                width="92"
                height="64"
                rx="10"
                fill="#EEF2FF"
                className="animate-pulse-subtle"
              />
              <rect
                x="30"
                y="42"
                width="60"
                height="8"
                rx="4"
                fill="#6366f1"
                className="animate-slideRight"
                style={{ animationDelay: "0.2s" }}
              />
              <rect
                x="30"
                y="56"
                width="43"
                height="8"
                rx="4"
                fill="#a5b4fc"
                className="animate-slideRight"
                style={{ animationDelay: "0.4s" }}
              />
              <rect
                x="30"
                y="70"
                width="30"
                height="8"
                rx="4"
                fill="#c7d2fe"
                className="animate-slideRight"
                style={{ animationDelay: "0.6s" }}
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4 my-5 p-2 text-center animate-slideUp bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-indigo-600">
          Reporting Financier
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-center mb-10 max-w-md leading-relaxed animate-slideUp animation-delay-200">
          Présentez facilement vos finances à votre équipe.
          <br />
          <span className="text-indigo-600 font-medium">
            Analyse rapide & visualisations claires.
          </span>
          <br />
          Conçu pour la simplicité et l'efficacité.
        </p>

        {/* Call-to-action buttons */}
        <div className="flex flex-wrap gap-4 justify-center animate-slideUp animation-delay-400">
          {/* Button: Connexion */}
          <a
            href="/auth/signin"
            className="group px-8 py-3 rounded-lg bg-gradient-to-r from-slate-900 to-slate-700 text-white font-medium text-sm shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden"
          >
            <span className="relative z-10">Connexion</span>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
          </a>
          {/* Button: Créer une entreprise */}
          <a
            href="/auth/signup"
            className="group px-8 py-3 rounded-lg border-2 border-slate-200 bg-white/80 backdrop-blur-sm text-slate-900 font-medium text-sm shadow-md hover:shadow-lg hover:border-indigo-300 transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <span className="group-hover:text-indigo-600 transition-colors">
              Créer une entreprise
            </span>
          </a>
          {/* Button: Dashboard */}
          <a
            href="/dashboard"
            className="group px-8 py-3 rounded-lg border-2 border-indigo-200 bg-indigo-50/80 backdrop-blur-sm text-indigo-700 font-medium text-sm shadow-md hover:shadow-lg hover:bg-indigo-100 transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <span className="group-hover:text-indigo-800 transition-colors">
              Dashboard
            </span>
          </a>
        </div>
      </div>
    </main>
  );
}
