import {
  Component,
  signal,
  inject,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { UploadComponent } from './features/upload/upload.component';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  @ViewChild('userMenuWrapper') userMenuWrapperRef!: ElementRef<HTMLDivElement>;

  protected readonly title = signal('playbacQ');
  dialog = inject(MatDialog);
  authService = inject(AuthService);
  userService = inject(UserService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  isEmbed = false;
  iconUrl: string | null = null;
  isOpenUserMenu = false;
  loggedInUserId: string | null = null;

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isEmbed = event.urlAfterRedirects.startsWith('/embed');
        if (!this.isEmbed) {
          this.authService.getUserID().subscribe((res) => {
            this.loggedInUserId = res ? res.userId : null;
            if (res && res.userId) {
              this.userService.getUserIcon(res.userId).subscribe((iconBlob) => {
                this.iconUrl = URL.createObjectURL(iconBlob);
                this.cdr.detectChanges();
              });
            }
          });
        }
      });
  }

  openUploadDialog() {
    const dialogRef = this.dialog.open(UploadComponent, {
      width: '700px',
      maxWidth: '80vw',
      maxHeight: '70vh',
      disableClose: true, // アップロード中に誤って枠外クリックで閉じないように保護
      autoFocus: false,
    });

    // 閉じた後の処理（必要に応じて動画リストの更新などを行う）
    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate(['/'], { queryParams: { reload: new Date().getTime() } });
    });
  }

  toggleUserMenu() {
    this.isOpenUserMenu = !this.isOpenUserMenu;
  }

  closeUserMenu() {
    this.isOpenUserMenu = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpenUserMenu && this.userMenuWrapperRef) {
      const clickedInside = this.userMenuWrapperRef.nativeElement.contains(event.target as Node);
      if (!clickedInside) {
        this.isOpenUserMenu = false;
      }
    }
  }

  onSearch(keyword: string) {
    if (keyword.trim()) {
      if (keyword.length > 1024) {
        alert('あり得ないことが起きています。HTMLを改竄していませんか？');
        return;
      }
      // ホーム画面（/）にクエリパラメータ ?search=keyword を付けて遷移
      this.router.navigate(['/'], { queryParams: { search: keyword } });
    } else {
      // キーワードが空ならパラメータなしでホームへ
      this.router.navigate(['/']);
    }
  }
}
