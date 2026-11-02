# Manual appointment creation

The calendar appointment editor uses a summary with separate customer, service, and merchandise selection views. Mobile uses a full-screen dialog. Customer search supports name, phone, and email; new customers are only persisted when the appointment is saved. Creating a customer does not grant SMS consent.

A booking uses one active service for the selected artist. Its approved price, duration, availability checks, deposit rules, and customer authorization are unchanged.

Merchandise is planned only. The server checks each item belongs to the appointment's organization and artist and is active, then saves its name in appointment notes. These notes are visible in appointment details. Planned items do not alter the service price or deposit and are not charged or automatically added to a checkout cart. Staff review the notes and add the products at checkout.

No schema migration is required: planned products use the existing appointment notes field.

Extra time can be added during creation (up to 240 minutes, with a total booking limit of 24 hours). Confirmed internal Maia appointments can also be extended in appointment details. Connected-provider bookings must be changed in that provider. Extensions check bookable hours and conflicts while holding the artist calendar lock, require the current schedule revision, and preserve price/deposit values. No customer message is sent by the extension control.

Appointment details show the remaining service amount due and the studio's current primary business location, rather than a location snapshot assigned to that booking. Missing primary addresses are explicitly indicated. The test deposit/balance checkout-link creation button is removed from appointment details.
