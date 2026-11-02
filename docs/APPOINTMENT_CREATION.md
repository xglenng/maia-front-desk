# Manual appointment creation

The calendar appointment editor uses a summary with separate customer, service, and merchandise selection views. Mobile uses a full-screen dialog. Customer search supports name, phone, and email; new customers are only persisted when the appointment is saved. Creating a customer does not grant SMS consent.

A booking uses one active service for the selected artist. Its approved price, duration, availability checks, deposit rules, and customer authorization are unchanged.

Merchandise is planned only. The server checks each item belongs to the appointment's organization and artist and is active, then saves its name in appointment notes. These notes are visible in appointment details. Planned items do not alter the service price or deposit and are not charged or automatically added to a checkout cart. Staff review the notes and add the products at checkout.

No schema migration is required: planned products use the existing appointment notes field.
