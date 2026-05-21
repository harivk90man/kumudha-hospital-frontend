-- Remove caste-bearing surnames from demo data.
-- Strategy: collapse "Dr. <First> <Caste>" → "Dr. <First>" for staff;
-- replace patient surnames with a neutral single-letter initial.

-- ---------------------------------------------------------------------
-- Users: drop the trailing caste surname.
-- ---------------------------------------------------------------------
update users set full_name = 'Dr. Priya'        where username = 'priya'        and full_name like '%Iyer%';
update users set full_name = 'Dr. Anand'        where username = 'dranand'      and full_name like '%Krishnan%';
update users set full_name = 'Dr. Meera'        where username = 'drmeera'      and full_name like '%Suresh%';
update users set full_name = 'Dr. Lakshmi'      where username = 'drlakshmi'    and full_name like '%Bharath%';
update users set full_name = 'Dr. Ravi'         where username = 'drravi'       and full_name like '%Shankar%';
update users set full_name = 'Dr. Naveen Kumar' where username = 'drnaveen'     and full_name like '%K Naveen%';
update users set full_name = 'Naveen'           where username = 'naveen'       and full_name like '%Rajan%';

-- ---------------------------------------------------------------------
-- Patients: blank out the last_name down to a single neutral initial.
-- Only touches rows whose last_name looks like a typical caste surname.
-- ---------------------------------------------------------------------
update patients
   set last_name = substring(last_name from 1 for 1) || '.'
 where last_name in (
   'Krishnan','Iyer','Iyengar','Subramaniam','Subramanian','Sharma',
   'Reddy','Nair','Pillai','Naidu','Gopalan','Verma','Bhatt','Sheikh',
   'Antony','Mathew','Selvam','Babu','Murugesan','Raghavan','Narasimhan'
 );

-- ---------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------
select 'users' as t, username as a, full_name as b
  from users
 where deleted_at is null and username in ('priya','dranand','drmeera','drlakshmi','drravi','drnaveen','naveen')
union all
select 'patients', uhid, first_name || ' ' || last_name
  from patients
 where deleted_at is null
   and last_name in (
     'Krishnan','Iyer','Iyengar','Subramaniam','Subramanian','Sharma',
     'Reddy','Nair','Pillai','Naidu','Gopalan','Verma','Bhatt','Sheikh',
     'Antony','Mathew','Selvam','Babu','Murugesan','Raghavan','Narasimhan'
   )
order by t, a;
