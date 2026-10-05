/**
 * Une case de sélection, avec une cible de 44 px autour d'une case de 20 :
 * on la touche au pouce sans ouvrir la ligne par mégarde. Partagée par la
 * liste des commandes et le catalogue.
 */
export function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={onChange}
        aria-label={label}
        className="accent-primary size-5 cursor-pointer"
      />
    </label>
  );
}
