// Ooruda uses its own domain billing engine (bills/payments tables), not
// MakerKit's SaaS subscription billing — this route is always available and
// is no longer gated by `enableTeamAccountBilling`.
function TeamAccountBillingLayout(props: React.PropsWithChildren) {
  return <>{props.children}</>;
}

export default TeamAccountBillingLayout;
