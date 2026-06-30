import Link from 'next/link';

export default function UnitNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-2xl text-2xl">
        🏢
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Unit not found</h1>
        <p className="text-muted-foreground max-w-xs text-sm">
          This unit doesn&apos;t exist or doesn&apos;t belong to your
          association.
        </p>
      </div>
      <Link
        href=".."
        data-test="unit-not-found-back"
        className="text-primary hover:text-primary/80 mt-2 text-sm font-medium underline underline-offset-4 transition-colors"
      >
        ← Back to units
      </Link>
    </div>
  );
}
