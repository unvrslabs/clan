export function SchemaCardDemo() {
  return (
    <div className="w-full max-w-xs">
      <div className="relative card-border overflow-hidden rounded-2xl flex flex-col">
        <div className="p-4 flex justify-center relative">
          <div className="w-full h-48 rounded-xl gradient-border inner-glow overflow-hidden relative">
            {/* Animated grid background */}
            <div className="absolute inset-0 opacity-10">
              <div
                className="w-full h-full animate-pulse"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)",
                  backgroundSize: "15px 15px",
                }}
              />
            </div>
            {/* Floating schema tables */}
            <div className="absolute inset-0 flex items-center justify-center gap-6 p-4">
              <div className="glass rounded-lg border border-indigo-400/20 px-3 py-2 text-[10px] text-white/70 space-y-1">
                <div className="text-indigo-300 font-medium text-xs mb-1">users</div>
                <div>id: uuid</div>
                <div>name: text</div>
                <div>email: text</div>
              </div>
              <div className="glass rounded-lg border border-indigo-400/20 px-3 py-2 text-[10px] text-white/70 space-y-1">
                <div className="text-indigo-300 font-medium text-xs mb-1">tasks</div>
                <div>id: uuid</div>
                <div>title: text</div>
                <div>status: enum</div>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="p-4">
          <span className="inline-block px-3 py-1 glass text-indigo-300 rounded-full text-xs font-medium mb-3 border border-indigo-400/30">
            Database
          </span>
          <h3 className="text-lg font-medium text-white mb-2">Schema Management</h3>
          <p className="text-white/70 mb-4 leading-relaxed text-xs">
            Design, optimize and maintain your database structure with powerful schema tools.
          </p>
          <div className="flex justify-between items-center">
            <span className="text-indigo-400 flex items-center text-xs font-medium glass px-3 py-1.5 rounded-lg border border-indigo-400/30">
              Manage
              <svg className="w-3 h-3 ml-1" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-white/50 text-xs glass px-2 py-1 rounded-full border border-white/10">Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}
