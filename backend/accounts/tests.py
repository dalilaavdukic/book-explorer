from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import User


class CustomUserModelTests(TestCase):
    def test_auth_user_model_is_the_custom_user(self):
        self.assertIs(get_user_model(), User)

    def test_create_user_hashes_the_password(self):
        user = User.objects.create_user(username="reader", password="s3cret-pass")

        self.assertNotEqual(user.password, "s3cret-pass")
        self.assertTrue(user.check_password("s3cret-pass"))
        self.assertFalse(user.is_staff)

    def test_create_superuser(self):
        admin = User.objects.create_superuser(username="admin", password="s3cret-pass")

        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)


class UserAdminTests(TestCase):
    def test_superuser_can_open_the_user_changelist(self):
        admin = User.objects.create_superuser(username="admin", password="s3cret-pass")
        self.client.force_login(admin)

        response = self.client.get(reverse("admin:accounts_user_changelist"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "admin")
