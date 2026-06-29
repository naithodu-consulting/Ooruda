alter table meter_readings
  add column minimum_charge numeric(10, 2) not null default 0;
