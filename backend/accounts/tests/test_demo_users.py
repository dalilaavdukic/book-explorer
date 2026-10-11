from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import User


def create_demo_users():
    out = StringIO()
    call_command("create_demo_users", stdout=out)
    return out.getvalue().splitlines()


class CreateDemoUsersTests(TestCase):
    def test_creates_both_readers_when_neither_exists(self):
        output = create_demo_users()

        self.assertEqual(output, ["Created alice.", "Created bob."])
        for username in ("alice", "bob"):
            with self.subTest(username=username):
                user = User.objects.get(username=username)
                self.assertTrue(user.check_password(f"{username}-password"))
                self.assertFalse(user.is_staff)
                self.assertFalse(user.is_superuser)

    def test_creates_only_the_missing_reader(self):
        User.objects.create_user(username="alice", password="alice-password")

        output = create_demo_users()

        self.assertEqual(
            output, ["Skipped alice: the user already exists.", "Created bob."]
        )
        self.assertEqual(User.objects.count(), 2)

    def test_second_run_creates_nothing_and_reports_both_as_skipped(self):
        create_demo_users()

        output = create_demo_users()

        self.assertEqual(
            output,
            [
                "Skipped alice: the user already exists.",
                "Skipped bob: the user already exists.",
            ],
        )
        self.assertEqual(User.objects.count(), 2)

    def test_existing_user_with_a_changed_password_is_left_untouched(self):
        alice = User.objects.create_user(username="alice", password="changed-password")

        output = create_demo_users()

        self.assertIn("Skipped alice: the user already exists.", output)
        self.assertEqual(User.objects.get(username="alice").password, alice.password)
