# Payment references

Every checkout payment method has an optional payment reference, including cash,
card, bank, credit, coupon and M-Pesa. Single payments and split tenders save the
reference in `PosPayment.Reference`, which existing receipt and order readers expose.
Coupon redemption still validates the coupon separately; the saved reference
contains both the coupon code and the additional typed reference.

When an M-Pesa payment is missing from the lookup list, enter its confirmation
code in Payment reference. No phone number or lookup result is required for this
manual path. For a split tender, set the M-Pesa amount before adding it.
Selected lookup codes and typed references are combined. Only selected lookup
transactions create M-Pesa allocation matches; a manual reference is not evidence
that the gateway verified the payment. The combined reference is limited to 100
characters and is validated without silently truncating it.

# FLM shop

Admin Setup > Shops / Terminals > Import FLM shops imports active, non-privacy-
blocked FLM customers marked Customer Type SHOP (3). Customer C00600, Kasarani
Feedmill, is shop FLM-C00600. Its company mirror and walk-in account resolve in
FLM, independently of the RMK account with the same customer number. Reruns reuse
the existing FLM mapping.

At initial setup, this customer had no BC location and FLM returned zero items
meeting the existing POS eligibility rules (PDA item, eTIMS code, nonzero sales
unit price, and not blocked). Configure the location and item eligibility in BC
before refreshing stock. No location or price was inferred.
