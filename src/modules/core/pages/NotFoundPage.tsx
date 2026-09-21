import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Page not found"
        subtitle="That address doesn't match anything in this hub."
      />
      <Link
        to="/"
        className="inline-flex h-12 items-center rounded-full bg-accent px-6 font-bold text-on-accent"
      >
        Go to home
      </Link>
    </>
  );
}
