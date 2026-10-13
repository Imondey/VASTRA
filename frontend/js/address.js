// Address form markup shared by checkout and the account page.
import { esc } from './ui.js';

export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

export function addressFields(a = {}, user = {}) {
  return `
    <div class="form-grid">
      <div class="field"><label for="fa_name">Full name</label><input id="fa_name" name="full_name" required maxlength="120" autocomplete="name" value="${esc(a.full_name || user.full_name || '')}"></div>
      <div class="field"><label for="fa_phone">Mobile number</label><input id="fa_phone" name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" value="${esc(a.phone || user.phone || '')}"></div>
      <div class="field full"><label for="fa_line1">Address</label><input id="fa_line1" name="line1" required maxlength="200" autocomplete="address-line1" placeholder="House no., building, street" value="${esc(a.line1 || '')}"></div>
      <div class="field full"><label for="fa_line2">Apartment, landmark (optional)</label><input id="fa_line2" name="line2" maxlength="200" autocomplete="address-line2" value="${esc(a.line2 || '')}"></div>
      <div class="field"><label for="fa_city">City</label><input id="fa_city" name="city" required maxlength="80" autocomplete="address-level2" value="${esc(a.city || '')}"></div>
      <div class="field"><label for="fa_state">State</label><select id="fa_state" name="state" required autocomplete="address-level1">
        <option value="">Select state</option>${STATES.map((s) => `<option ${a.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="fa_pin">PIN code</label><input id="fa_pin" name="postal_code" required maxlength="10" inputmode="numeric" autocomplete="postal-code" value="${esc(a.postal_code || '')}"></div>
      <div class="field"><label for="fa_label">Save as</label><select id="fa_label" name="label">
        ${['Home', 'Work', 'Other'].map((l) => `<option ${a.label === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>`;
}

export function addressText(a) {
  return `${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}`;
}
