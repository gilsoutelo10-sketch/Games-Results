"use client";

import { usePathname, useRouter } from "next/navigation";

type Opt = { id: number; name: string };

export type SelectorsProps = {
  seasons: Opt[];
  associations: Opt[];
  ageGroups: Opt[];
  phases: Opt[];
  series: Opt[];
  selected: {
    season?: number;
    assoc?: number;
    group?: number;
    phase?: number;
    serie?: number;
  };
};

const ORDER = ["season", "assoc", "group", "phase", "serie"] as const;
type Key = (typeof ORDER)[number];

export default function Selectors(props: SelectorsProps) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(key: Key, value: string) {
    const params = new URLSearchParams();
    const idx = ORDER.indexOf(key);
    // keep selections above this level
    for (let i = 0; i < idx; i++) {
      const k = ORDER[i];
      const v = props.selected[k];
      if (v) params.set(k, String(v));
    }
    if (value) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const fields: Array<{ key: Key; label: string; options: Opt[]; disabled: boolean }> = [
    { key: "season", label: "Época", options: props.seasons, disabled: false },
    { key: "assoc", label: "Associação", options: props.associations, disabled: !props.selected.season },
    { key: "group", label: "Escalão", options: props.ageGroups, disabled: !props.selected.assoc },
    { key: "phase", label: "Fase", options: props.phases, disabled: !props.selected.group },
    { key: "serie", label: "Série", options: props.series, disabled: !props.selected.phase },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">{f.label}</span>
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-100 disabled:text-slate-400"
            value={props.selected[f.key] ?? ""}
            disabled={f.disabled}
            onChange={(e) => onChange(f.key, e.target.value)}
          >
            <option value="">— Selecionar —</option>
            {f.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {!f.disabled && f.options.length === 0 && (
            <span className="text-xs text-amber-600">Sem dados ainda</span>
          )}
        </label>
      ))}
    </div>
  );
}
